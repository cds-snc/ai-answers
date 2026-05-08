import { getApiUrl } from '../utils/apiToUrl.js';
import { ChatWorkflowService, ShortQueryValidation, RedactionError } from '../services/ChatWorkflowService.js';

import AuthService from '../services/AuthService.js';
import SessionService from '../services/SessionService.js';

export class GraphClient {
  constructor(graphName = 'DefaultWithVectorGraph') {
    this.graphName = graphName;
  }

  async processResponse(
    chatId,
    userMessage,
    userMessageId,
    conversationHistory,
    lang,
    department,
    referringUrl,
    selectedAI,
    translationF,
    onStatusUpdate,
    searchProvider,
    overrideUserId = null
  ) {
    const controller = new AbortController();
    let reader = null;

    try {
      // Extract historySignature from the last AI message in history
      const lastAiMessage = Array.isArray(conversationHistory)
        ? [...conversationHistory].reverse().find(m => m.sender === 'ai' || (m.interaction && m.interaction.answer))
        : null;
      const historySignature = lastAiMessage?.historySignature ||
        lastAiMessage?.interaction?.historySignature ||
        lastAiMessage?.interaction?.answer?.historySignature ||
        null;

      const visitorId = await SessionService.getVisitorId();

      const payload = {
        graph: this.graphName,
        input: {
          chatId,
          userMessage,
          userMessageId,
          conversationHistory,
          historySignature,
          lang,
          department,
          referringUrl,
          selectedAI,
          translationF,
          searchProvider,
          overrideUserId,
          visitorId,
        },
      };

      const response = await AuthService.fetch(getApiUrl('chat-graph-run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Graph request failed: status=${response.status} body=${errorText}`);
      }

      if (!response.body) {
        throw new Error('Graph response missing body stream');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      const processEvent = (chunk) => {
        if (!chunk.trim()) {
          return { done: false };
        }

        const lines = chunk.split('\n');
        let eventType = 'message';
        const dataLines = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        let parsedData = null;
        if (dataLines.length) {
          const payloadStr = dataLines.join('\n');
          try {
            parsedData = JSON.parse(payloadStr);
          } catch (_err) {
            parsedData = payloadStr;
          }
        }

        if (eventType === 'status' && parsedData && parsedData.status) {
          ChatWorkflowService.sendStatusUpdate(onStatusUpdate, parsedData.status);
          return { done: false };
        }

        if (eventType === 'log' && parsedData) {
          try {
            const level = parsedData.level || 'log';
            const payload = parsedData;
            if (console && typeof console[level] === 'function') {
              console[level](payload);
            } else if (console && console.log) {
              console.log(payload);
            }
          } catch (_e) {
            // ignore client-side logging errors
          }
          return { done: false };
        }

        if (eventType === 'result') {
          completed = true;
          if (parsedData) {
            return { done: true, value: parsedData };
          }
          throw new Error('Graph completed without result payload');
        }

        if (eventType === 'error') {
          // Expect a structured payload produced by the server (buildGraphErrorPayload)
          if (parsedData && typeof parsedData === 'object') {
            const errorName = parsedData.name || parsedData.type;
            if (errorName === 'ShortQueryValidation') {
              const fallbackUrl = parsedData.fallbackUrl || parsedData.searchUrl || '';
              const sq = new ShortQueryValidation(
                parsedData.message || 'Short query detected',
                parsedData.userMessage || userMessage,
                fallbackUrl
              );
              if (parsedData.historySignature) sq.historySignature = parsedData.historySignature;
              throw sq;
            }
            if (errorName === 'RedactionError') {
              const re = new RedactionError(
                parsedData.message || 'Redaction error',
                parsedData.redactedText || '',
                parsedData.redactedItems || null
              );
              if (parsedData.historySignature) re.historySignature = parsedData.historySignature;
              throw re;
            }
            // Unknown named error: construct and throw Error with provided name
            const err = new Error(parsedData.message || 'Graph execution failed');
            err.name = parsedData.name || parsedData.type || err.name;
            throw err;
          }
          // If server sent a plain string, throw it as an Error
          if (typeof parsedData === 'string') {
            throw new Error(parsedData);
          }
          throw new Error('Graph execution failed');
        }

        return { done: false };
      };

      return await new Promise((resolve, reject) => {
        const readLoop = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              if (buffer) {
                try {
                  const finalResult = processEvent(buffer);
                  if (finalResult?.done && finalResult.value) {
                    resolve(finalResult.value);
                    return;
                  }
                } catch (err) {
                  reject(err);
                  return;
                }
              }
              if (!completed) {
                reject(new Error('Graph stream ended before result event'));
              }
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const segments = buffer.split('\n\n');
            buffer = segments.pop() || '';

            for (const segment of segments) {
              let parsed;
              try {
                parsed = processEvent(segment);
              } catch (err) {
                reject(err);
                return;
              }

              if (parsed?.done) {
                resolve(parsed.value);
                return;
              }
            }

            readLoop();
          }).catch((err) => {
            if (completed && err?.name === 'AbortError') {
              return;
            }
            if (err?.name === 'AbortError') {
              reject(new Error('Graph stream aborted'));
            } else {
              reject(err);
            }
          });
        };

        readLoop();
      });
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch (_err) {
          // ignore
        }
      }
      controller.abort();
    }
  }
}

export default GraphClient;
