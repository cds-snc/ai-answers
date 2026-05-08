import { describe, it, expect, vi } from 'vitest';
import { setStreamingHeaders } from '../chat-graph-run.js';

describe('setStreamingHeaders', () => {
  it('sets SSE-friendly headers and flushes immediately', () => {
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      socket: {
        setNoDelay: vi.fn(),
      },
    };

    setStreamingHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, no-transform, must-revalidate, proxy-revalidate'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store');
    expect(res.socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(res.flushHeaders).toHaveBeenCalled();
  });
});
