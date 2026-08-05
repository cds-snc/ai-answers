import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
import axios from 'axios';

import downloadWebPageTool from '../downloadWebPage.js';

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
});
