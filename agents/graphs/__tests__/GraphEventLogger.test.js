import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as GraphEventLogger from '../GraphEventLogger.js';
import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { graphRequestContext } from '../requestContext.js';

describe('GraphEventLogger', () => {
  let infoSpy;
  let errorSpy;
  let originalGetStore;

  beforeEach(() => {
    infoSpy = vi.spyOn(ServerLoggingService, 'info').mockResolvedValue();
    errorSpy = vi.spyOn(ServerLoggingService, 'error').mockResolvedValue();
    // preserve original getStore
    originalGetStore = graphRequestContext.getStore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    graphRequestContext.getStore = originalGetStore;
  });

  it('calls ServerLoggingService and writer when writer present', async () => {
    const writer = vi.fn();
    graphRequestContext.getStore = () => ({ graphEventWriter: writer });

    const level = 'info';
    const message = 'checked url';
    const chatId = 'chat-1';
    const data = { url: 'https://example.com' };

    await GraphEventLogger.logGraphEvent(level, message, chatId, data);

    expect(infoSpy).toHaveBeenCalledWith(message, chatId, data);
    expect(writer).toHaveBeenCalled();
    const [eventName, payload] = writer.mock.calls[0];
    expect(eventName).toBe('log');
    expect(payload.level).toBe(level);
    expect(payload.chatId).toBe(chatId);
    expect(payload.message).toBe(message);
    expect(payload.data).toEqual(data);
  });

  it('does not call writer when no writer present', async () => {
    graphRequestContext.getStore = () => null;

    const level = 'info';
    const message = 'no writer';
    const chatId = 'chat-2';
    const data = { x: 1 };

    await GraphEventLogger.logGraphEvent(level, message, chatId, data);

    expect(infoSpy).toHaveBeenCalledWith(message, chatId, data);
  });

  it('handles error level by calling ServerLoggingService.error and writer', async () => {
    const writer = vi.fn();
    graphRequestContext.getStore = () => ({ graphEventWriter: writer });

    const level = 'error';
    const message = 'boom';
    const chatId = 'chat-err';
    const errorObj = new Error('fail');

    await GraphEventLogger.logGraphEvent(level, message, chatId, errorObj);

    expect(errorSpy).toHaveBeenCalled();
    expect(writer).toHaveBeenCalled();
    const [eventName, payload] = writer.mock.calls[0];
    expect(eventName).toBe('log');
    expect(payload.level).toBe(level);
  });
});
