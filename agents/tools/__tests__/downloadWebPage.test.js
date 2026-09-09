import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
import axios from 'axios';

import { getEncoding } from 'js-tiktoken';

import downloadWebPageTool, {
  REQUEST_TIMEOUT_MS,
  RETRY_TIME_BUDGET_MS,
  DEFAULT_MAX_TOKENS,
} from '../downloadWebPage.js';

const encodingForTests = getEncoding('cl100k_base');

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

const filler = (word) => `${word} `.repeat(40);

// The shape that broke the counter-tariff page: one <main> holding several
// dated <details> blocks, the current one small and the superseded one much
// larger. Readability scores the biggest block highest and keeps only that.
const accordionPage = htmlPage(`
  <main>
    <h1>Complete list of U.S. products subject to counter tariffs</h1>
    <p>Updated list of products effective September 8, 2026. ${filler('intro')}</p>
    <details>
      <summary>Effective September 8, 2026</summary>
      <table><tbody>
        <tr><td>0402.10.10</td><td>Milk and cream. ${filler('current')}</td></tr>
      </tbody></table>
    </details>
    <details>
      <summary>Effective up to August 31, 2025</summary>
      <table><tbody>
        <tr><td>0105.11.22</td><td>Live poultry. ${filler('superseded')}</td></tr>
        <tr><td>9701.91.10</td><td>Other collections. ${filler('superseded')}</td></tr>
        <tr><td>3305.10.00</td><td>Shampoos. ${filler('superseded')}</td></tr>
      </tbody></table>
    </details>
  </main>
`);

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

  describe('content extraction', () => {
    // The regression this whole block exists for: Readability kept only the
    // largest <details> block, so the agent read a superseded tariff list and
    // reported it as the current one. Nothing errored — the tool returned
    // "success" with the wrong list in it.
    it('keeps every section of a page built from sibling accordion blocks', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      expect(output).toContain('0402.10.10'); // current list
      expect(output).toContain('0105.11.22'); // superseded list
      expect(output).toContain('9701.91.10');
    });

    it('keeps the smaller current section rather than only the largest one', async () => {
      // Stated separately because this is the exact failure: the biggest block
      // wins on density, and the block that matters is usually the newest and
      // therefore the smallest.
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      expect(output).toContain('0402.10.10');
    });

    it('renders a <summary> as a heading so each section keeps its label', async () => {
      // Without this the three lists concatenate with no boundary and the agent
      // cannot tell which effective date it is reading.
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      expect(output).toMatch(/^#+ Effective September 8, 2026$/m);
      expect(output).toMatch(/^#+ Effective up to August 31, 2025$/m);
    });

    it('keeps the page intro that sits outside the accordions', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      expect(output).toContain('effective September 8, 2026');
    });

    it('drops inline styles and scripts from <main>', async () => {
      const withNoise = htmlPage(`
        <main>
          <style>.gc-nav { color: #333; background-image: url(x); }</style>
          <h1>Funding programs</h1>
          <p>Business Scale-up and Productivity. ${'funding detail '.repeat(30)}</p>
          <script>var trackingPixel = 1;</script>
        </main>
      `);
      axios.get.mockResolvedValueOnce({ status: 200, data: withNoise });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/funding.html' });

      expect(output).toContain('Business Scale-up and Productivity');
      expect(output).not.toContain('background-image');
      expect(output).not.toContain('trackingPixel');
    });

    it('falls back to Readability when the page has no <main>', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: realContent });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/no-main.html' });

      expect(output).toContain('705-424-1200');
    });

    it('falls back when <main> is an empty shell awaiting hydration', async () => {
      // Some sites render a real <main> and fill it in with JavaScript. Taking
      // it at face value would return a heading and nothing else.
      // Carries noise inside the shell so the fallback runs on a <main> that
      // was already stripped in place — pickContent does not clone it.
      const shellMain = htmlPage(`
        <main>
          <style>.app { display: none; }</style>
          <div class="wb-share">Share this page</div>
          <div id="app"></div>
        </main>
        <article>
          <h1>Bring food into Canada</h1>
          <p>${'You may bring limited quantities of food for personal use. '.repeat(8)}</p>
        </article>
      `);
      axios.get.mockResolvedValueOnce({ status: 200, data: shellMain });

      const output = await invokeTool({ url: 'https://inspection.canada.ca/en/food.html' });

      expect(output).toContain('limited quantities of food');
    });

    it('does not repeat the title when <main> already carries the h1', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      const headings = output.match(/^# .+$/gm) || [];
      expect(headings).toHaveLength(1);
    });
  });

  describe('truncation', () => {
    // Long enough to blow any sane cap: distinct numbered rows so the test can
    // tell which end of the page survived.
    const longPage = htmlPage(`
      <main>
        <h1>Complete list of products</h1>
        ${Array.from({ length: 12000 }, (_, i) =>
          `<p>Row ${i} tariff item ${i}.10.10 with an indicative description of the goods.</p>`
        ).join('')}
      </main>
    `);

    it('tells the model when a page was too long to read in full', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: longPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/long.html' });

      expect(output).toContain('[TRUNCATED]');
    });

    it('warns against concluding something is absent from a page it only partly read', async () => {
      // The whole point of the notice. A clipped list page otherwise produces a
      // confident "no, that product is not on the list" from an excerpt.
      axios.get.mockResolvedValueOnce({ status: 200, data: longPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/long.html' });

      expect(output).toMatch(/do not say that something is absent/i);
      expect(output).toMatch(/do not treat any list above as complete/i);
    });

    it('keeps the start of the page, where the current content sits', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: longPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/long.html' });

      expect(output).toContain('Row 0 ');
      expect(output).not.toContain('Row 11999 ');
    });

    // A page whose sections are the point of it: the first list finishes well
    // inside the cap, the second is where the clip lands. Mirrors the
    // counter-tariff page, where hedging on the completed current list was the
    // whole cost of a blanket warning.
    const sectionedPage = htmlPage(`
      <main>
        <h1>Complete list of products</h1>
        <details>
          <summary>Effective September 8, 2026</summary>
          ${Array.from({ length: 400 }, (_, i) =>
            `<p>Current ${i} tariff item ${1000 + i}.10.10 with an indicative description.</p>`
          ).join('')}
        </details>
        <details>
          <summary>Effective up to August 31, 2025</summary>
          ${Array.from({ length: 12000 }, (_, i) =>
            `<p>Superseded ${i} tariff item ${2000 + i}.20.20 with an indicative description.</p>`
          ).join('')}
        </details>
      </main>
    `);

    it('names the last section it read in full', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: sectionedPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/sectioned.html' });

      expect(output).toContain('Sections through "Effective September 8, 2026" were read in full');
    });

    it('names the section the clip landed in', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: sectionedPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/sectioned.html' });

      expect(output).toContain('"Effective up to August 31, 2025" was cut off partway');
    });

    it('does not tell the model to distrust a section it read in full', async () => {
      // The regression this replaced: a blanket "do not treat any list above as
      // complete" made the model hedge on the current list, which was complete.
      axios.get.mockResolvedValueOnce({ status: 200, data: sectionedPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/sectioned.html' });

      expect(output).not.toMatch(/do not treat any list above as complete/i);
      expect(output).toMatch(/a list there is complete/i);
    });

    it('falls back to the blanket warning when there are no section headings', async () => {
      // With nothing to name, understating what was read is the safe default.
      axios.get.mockResolvedValueOnce({ status: 200, data: longPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/long.html' });

      expect(output).toMatch(/do not treat any list above as complete/i);
    });

    it('stays within the token cap once the notice is appended', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: sectionedPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/sectioned.html' });

      expect(encodingForTests.encode(output).length).toBeLessThanOrEqual(DEFAULT_MAX_TOKENS);
    });

    it('says nothing about truncation when the whole page was read', async () => {
      axios.get.mockResolvedValueOnce({ status: 200, data: accordionPage });

      const output = await invokeTool({ url: 'https://www.canada.ca/en/list.html' });

      expect(output).not.toContain('[TRUNCATED]');
    });
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

  // The deployed VPC allows outbound 443 only, and a NACL denial drops the
  // packet silently — an http:// request hangs until the 5s timeout instead of
  // failing fast, which reads as a flaky site rather than an unsent request.
  it('requests https after being given an http URL', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: realContent });

    await invokeTool({
      url: 'http://inspection.canada.ca/en/animal-health/livestock-feeds',
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://inspection.canada.ca/en/animal-health/livestock-feeds',
      expect.anything()
    );
  });

  it('rejects an unusable URL without reporting it as a download failure', async () => {
    const error = await invokeTool({ url: 'javascript:alert(1)' }).catch((e) => e);

    expect(error.message).toMatch(/unsupported scheme/);
    expect(error.message).not.toContain('Failed to download webpage');
    expect(axios.get).not.toHaveBeenCalled();
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
