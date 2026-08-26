import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
import axios from 'axios';

import downloadWebPageTool, {
  REQUEST_TIMEOUT_MS,
  RETRY_TIME_BUDGET_MS,
} from '../downloadWebPage.js';

const invokeTool = (input) => downloadWebPageTool.invoke(input);

const htmlPage = (body) => `<!DOCTYPE html><html><head><title>Test page</title></head><body>${body}</body></html>`;

// A real Canada.ca page's main content, comfortably above the minimum.
const realContent = htmlPage(`
  <main><article>
    <h1>Contact Transition Services Borden</h1>
    <p>${'You can reach the Transition Centre by telephone during business hours. '.repeat(6)}</p>
    <p>The phone number for Transition Services Borden is 705-424-1200 ext. 2035.</p>
  </article></main>
`);

// A client-rendered SPA: HTTP 200, but the body holds no content before hydration.
const spaShell = htmlPage('<div id="__nuxt"></div><div id="teleports"></div>');

describe('downloadWebPage tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns markdown for a page with readable content', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: realContent });

    const output = await invokeTool({ url: 'https://www.canada.ca/en/real-page.html' });

    expect(output).toContain('705-424-1200');
    expect(output.trim().length).toBeGreaterThan(50);
  });

  it('throws when a 200 response yields no readable content (client-rendered page)', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: spaShell });

    await expect(invokeTool({ url: 'https://military-transition.canada.ca/en/centre/4' }))
      .rejects.toThrow(/No readable content/);
  });

  it('tells the model the URL is still citable but its content was not read', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: spaShell });

    const error = await invokeTool({ url: 'https://military-transition.canada.ca/en/centre/4' })
      .catch((e) => e);

    expect(error.message).toContain('https://military-transition.canada.ca/en/centre/4');
    expect(error.message).toMatch(/may still be cited/i);
    expect(error.message).toMatch(/do not retry/i);
  });

  it('does not report an empty page as a generic download failure', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: spaShell });

    const error = await invokeTool({ url: 'https://military-transition.canada.ca/en/centre/4' })
      .catch((e) => e);

    // The empty-content guard must not be swallowed and re-wrapped by the
    // network-error handler, which would hide why the read produced nothing.
    expect(error.message).not.toContain('Failed to download webpage');
  });

  it('still surfaces real HTTP failures', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 404 }, config: {} });

    await expect(invokeTool({ url: 'https://www.canada.ca/en/gone.html' }))
      .rejects.toThrow(/Page not found \(404\)/);
  });

  describe('transient network failures', () => {
    const connReset = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
      config: {},
    });

    it('retries a dropped connection and returns the page on the next attempt', async () => {
      // The failure this guards against: one RST from a WAF or origin used to
      // fail the tool call outright, so the agent answered without the page.
      axios.get
        .mockRejectedValueOnce(connReset)
        .mockResolvedValueOnce({ status: 200, data: realContent });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const output = await invokeTool({ url: 'https://ised-isde.canada.ca/site/ised/en/page' });

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(output).toContain('705-424-1200');
    });

    it('gives up after exhausting attempts and reports the failure', async () => {
      axios.get.mockRejectedValue(connReset);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://ised-isde.canada.ca/site/ised/en/page' }))
        .rejects.toThrow(/Failed to download webpage/);
      expect(axios.get).toHaveBeenCalledTimes(3);
    });

    it('does not retry a 404 — the page is gone, not flaky', async () => {
      axios.get.mockRejectedValue({ response: { status: 404 }, config: {} });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://www.canada.ca/en/gone.html' }))
        .rejects.toThrow(/Page not found \(404\)/);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry a page that returned 200 with no readable content', async () => {
      axios.get.mockResolvedValue({ status: 200, data: spaShell });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://military-transition.canada.ca/en/centre/4' }))
        .rejects.toThrow(/No readable content/);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry a hostname that does not resolve', async () => {
      // The model invents URLs; NXDOMAIN will not change on a second lookup.
      const noSuchHost = Object.assign(new Error('getaddrinfo ENOTFOUND nope.canada.ca'), {
        code: 'ENOTFOUND',
        config: {},
      });
      axios.get.mockRejectedValue(noSuchHost);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://nope.canada.ca/en/page' }))
        .rejects.toThrow(/Failed to download webpage/);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry a refused connection', async () => {
      const refused = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        config: {},
      });
      axios.get.mockRejectedValue(refused);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://www.canada.ca:9999/en/page' }))
        .rejects.toThrow(/Connection refused/);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('budgets less time for retries than one request is allowed to take', () => {
      // This is what stops a timeout being retried: retryOnTransientError checks
      // elapsed time after a failure, so a request that used its full timeout is
      // already over budget. Asserted as an invariant because a mocked rejection
      // returns instantly and cannot burn real wall-clock time — the budget
      // itself is exercised in api/util/__tests__/transient-retry.test.js.
      expect(RETRY_TIME_BUDGET_MS).toBeLessThan(REQUEST_TIMEOUT_MS);
    });

    it('reports an axios timeout as a timeout, not a generic failure', async () => {
      // axios raises its own `timeout: 5000` as ECONNABORTED, so the
      // ETIMEDOUT-only check never fired for the timeout it was written for.
      const timeout = Object.assign(new Error('timeout of 5000ms exceeded'), {
        code: 'ECONNABORTED',
        config: {},
      });
      axios.get.mockRejectedValue(timeout);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(invokeTool({ url: 'https://www.canada.ca/en/slow.html' }))
        .rejects.toThrow(/Request timed out/);
    });
  });
});
