import { getApiUrl } from '../utils/apiToUrl.js';
import { ChatWorkflowService, ShortQueryValidation, RedactionError, ChatRunInProgressError } from '../services/ChatWorkflowService.js';

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
      // Accept both stream formats; the server chooses the active transport from Settings.
      const response = await AuthService.fetch(getApiUrl('chat-graph-run'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/x-ndjson',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorPayload = JSON.parse(errorText);
          if (response.status === 429 && errorPayload?.error === 'chat_run_in_progress') {
            throw new ChatRunInProgressError(errorPayload.message || 'A chat response is already in progress for this session');
          }
        } catch (error) {
          if (error instanceof ChatRunInProgressError) throw error;
        }
        throw new Error(`Graph request failed: status=${response.status} body=${errorText}`);
      }

      if (!response.body) {
        throw new Error('Graph response missing body stream');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      const contentType = response.headers?.get?.('content-type') || '';
      const isNdjson = contentType.includes('application/x-ndjson');

      const parseSseEvent = (chunk) => {
        if (!chunk.trim()) {
          return null;
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

        let data = null;
        if (dataLines.length) {
          const payloadStr = dataLines.join('\n');
          try {
            data = JSON.parse(payloadStr);
          } catch (_err) {
            data = payloadStr;
          }
        }

        return { event: eventType, data };
      };

      const parseNdjsonEvent = (line) => {
        if (!line.trim()) {
          return null;
        }

        const parsed = JSON.parse(line);
        return {
          event: parsed.event || parsed.type || 'message',
          data: parsed.data ?? parsed.payload ?? null,
        };
      };

      const processParsedEvent = ({ event, data }) => {
        if (event === 'status' && data && data.status) {
          try {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('[chat-graph-run status]', data);
            }
          } catch (_e) {
            // ignore client-side debug logging errors
          }
          ChatWorkflowService.sendStatusUpdate(onStatusUpdate, data.status);
          return { done: false };
        }

        if (event === 'log' && data) {
          try {
            const level = data.level || 'log';
            const payload = data;
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

        if (event === 'result') {
          completed = true;
          if (data) {
            return { done: true, value: data };
          }
          throw new Error('Graph completed without result payload');
        }

        if (event === 'error') {
          // Expect a structured payload produced by the server (buildGraphErrorPayload)
          if (data && typeof data === 'object') {
            const errorName = data.name || data.type;
            if (errorName === 'ShortQueryValidation') {
              const fallbackUrl = data.fallbackUrl || data.searchUrl || '';
              const sq = new ShortQueryValidation(
                data.message || 'Short query detected',
                data.userMessage || userMessage,
                fallbackUrl
              );
              if (data.historySignature) sq.historySignature = data.historySignature;
              throw sq;
            }
            if (errorName === 'RedactionError') {
              const re = new RedactionError(
                data.message || 'Redaction error',
                data.redactedText || '',
                data.redactedItems || null
              );
              if (data.historySignature) re.historySignature = data.historySignature;
              throw re;
            }
            // Unknown named error: construct and throw Error with provided name
            const err = new Error(data.message || 'Graph execution failed');
            err.name = data.name || data.type || err.name;
            throw err;
          }
          // If server sent a plain string, throw it as an Error
          if (typeof data === 'string') {
            throw new Error(data);
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
                  const finalEvent = isNdjson ? parseNdjsonEvent(buffer) : parseSseEvent(buffer);
                  const finalResult = finalEvent ? processParsedEvent(finalEvent) : { done: false };
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
            const segments = buffer.split(isNdjson ? '\n' : '\n\n');
            buffer = segments.pop() || '';

            for (const segment of segments) {
              let parsed;
              try {
                const event = isNdjson ? parseNdjsonEvent(segment) : parseSseEvent(segment);
                parsed = event ? processParsedEvent(event) : { done: false };
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
