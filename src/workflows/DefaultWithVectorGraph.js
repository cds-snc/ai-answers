import { getApiUrl } from '../utils/apiToUrl.js';
import { ChatWorkflowService } from '../services/ChatWorkflowService.js';
import { getFingerprint } from '../utils/fingerprint.js';

export class DefaultWithVectorGraph {
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
      const payload = {
        graph: 'DefaultWithVectorGraph',
        input: {
          chatId,
          userMessage,
          userMessageId,
          conversationHistory,
          lang,
          department,
          referringUrl,
          selectedAI,
          translationF,
          searchProvider,
          overrideUserId,
        },
      };

      // include fingerprint header (if available) and send cookies so
      // server session middleware can associate this request
      const headers = { 'Content-Type': 'application/json' };
      try {
        const fp = await getFingerprint();
        if (fp) {
          headers['x-fp-id'] = fp;
        }
      } catch (_err) {
        // ignore fingerprint errors; proceed without header
      }

      const response = await fetch(getApiUrl('chat-graph-run'), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'include'
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

        if (eventType === 'result') {
          completed = true;
          if (parsedData) {
            return { done: true, value: parsedData };
          }
          throw new Error('Graph completed without result payload');
        }

        if (eventType === 'error') {
          const errMessage = (parsedData && parsedData.message) || 'Graph execution failed';
          throw new Error(errMessage);
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

export default DefaultWithVectorGraph;

