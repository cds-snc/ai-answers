import { describe, expect, it } from 'vitest';
import { buildStepTimeline, buildMetadataCellHtml, formatMetadataValue } from '../chatViewer.js';

const labels = { seeFullFieldLabel: 'Full {key}', seeFullValueLabel: 'Full value' };

describe('formatMetadataValue', () => {
  it('pretty-prints tagged XML-ish content one tag/text run per line, indented by nesting depth - not one unbroken line', () => {
    const raw =
      '<english-answer> <s-1>Yes, some adults can renew online.</s-1> <s-2>Check the IRCC page.</s-2> </english-answer> <citation-url>https://example.com</citation-url>';

    const { formattedContent, isXML } = formatMetadataValue(raw);

    expect(isXML).toBe(true);
    expect(formattedContent).toBe(
      [
        '<english-answer>',
        '  <s-1>',
        '    Yes, some adults can renew online.',
        '  </s-1>',
        '  <s-2>',
        '    Check the IRCC page.',
        '  </s-2>',
        '</english-answer>',
        '<citation-url>',
        '  https://example.com',
        '</citation-url>',
      ].join('\n')
    );
  });
});

describe('buildMetadataCellHtml', () => {
  it('renders nothing for empty/null metadata - no button, no details', () => {
    expect(buildMetadataCellHtml({}, labels)).toBe('');
    expect(buildMetadataCellHtml(null, labels)).toBe('');
    expect(buildMetadataCellHtml(undefined, labels)).toBe('');
  });

  it("special-cases a 'content' field holding an <english-answer>: just the tag name sits beside the label, not any of the answer text - the full raw value is reachable as 'Full answer'", () => {
    const raw =
      '<english-answer> <s-1>Yes, you can renew online.</s-1> <s-2>Check the IRCC page.</s-2> </english-answer> <citation-url>https://example.com</citation-url>';
    const html = buildMetadataCellHtml({ content: raw }, labels);

    expect(html).toContain('<b>content:</b> &lt;english-answer&gt;');
    // None of the actual answer text next to the label - only the tag name.
    const detailsStart = html.indexOf('<details');
    expect(html.slice(0, detailsStart)).not.toContain('renew online');
    expect(html).not.toContain('<details class="metadata-more"><summary>Full content</summary>');
    expect(html).toContain('<summary>Full answer</summary>');
    // The full raw value (sentence tags, citation-url and all) is still
    // there, just moved into the disclosure.
    expect(html).toContain('citation-url');
    expect(html).toContain('renew online');
  });

  it("shows <answer> (the translated tag - there's no literal <french-answer>) when that's what's present instead", () => {
    const html = buildMetadataCellHtml({ content: '<answer><s-1>Oui, vous pouvez.</s-1></answer>' }, labels);

    expect(html).toContain('<b>content:</b> &lt;answer&gt;');
  });

  it("applies the same treatment when the answer is nested one level down, under an 'answer' field's own .content", () => {
    const html = buildMetadataCellHtml(
      {
        answer: {
          content: '<english-answer>Yes, you can renew online.</english-answer>',
          inputTokens: 14415,
          tools: [{ tool: 'downloadWebPage' }],
        },
      },
      labels
    );

    expect(html).toContain('<b>answer:</b> &lt;english-answer&gt;');
    expect(html).toContain('<summary>Full answer</summary>');
    // The full raw object (inputTokens, tools and all) is still there.
    expect(html).toContain('inputTokens');
    expect(html).toContain('downloadWebPage');
  });

  it("falls back to the normal long-value handling for a 'content' field with no answer tag", () => {
    const html = buildMetadataCellHtml({ content: 'x'.repeat(310) }, labels);

    expect(html).toContain('<div class="metadata-pair"><b>content:</b></div>');
    expect(html).toContain('<summary>Full content</summary>');
  });

  it('shows every short scalar field in full, no matter how many there are - not capped at 4', () => {
    const html = buildMetadataCellHtml(
      {
        pageLanguage: 'en',
        query: 'renew passport online',
        model: 'gpt-4.1-mini-2025-04-14',
        inputTokens: 1853,
        outputTokens: 8,
      },
      labels
    );

    expect(html).toContain('<b>pageLanguage:</b> en');
    expect(html).toContain('<b>outputTokens:</b> 8');
    expect(html).not.toContain('<details');
  });

  it("collapses only the one field whose own value is long, keeping its own <b>key:</b> label line and a 'Full {key}' disclosure below it", () => {
    const html = buildMetadataCellHtml(
      {
        model: 'gpt-4.1-2025-04-14',
        context: { department: 'IRCC', note: 'x'.repeat(280) },
      },
      labels
    );

    // The short sibling stays inline...
    expect(html).toContain('<b>model:</b> gpt-4.1-2025-04-14');
    // ...the long one keeps the same bare <b>key:</b> label line as every
    // other field (no value crammed in next to it)...
    expect(html).toContain('<div class="metadata-pair"><b>context:</b></div>');
    // ...with its content moved into its own "Full context" disclosure.
    expect(html).toContain('<details class="metadata-more">');
    expect((html.match(/<details/g) || []).length).toBe(1);
    expect(html).toContain('<summary>Full context</summary>');
    expect(html).toContain('x'.repeat(280));
  });

  it('gives each long field its own separate <details>, not one shared bucket', () => {
    const html = buildMetadataCellHtml(
      {
        context: 'c'.repeat(310),
        cleanedHistory: 'h'.repeat(310),
      },
      labels
    );

    expect((html.match(/<details class="metadata-more">/g) || []).length).toBe(2);
    expect(html).toContain('<summary>Full context</summary>');
    expect(html).toContain('<summary>Full cleanedHistory</summary>');
  });

  it('strips _id recursively, including from nested subdocuments', () => {
    const html = buildMetadataCellHtml(
      {
        _id: { buffer: { 0: 106, 1: 142 } },
        interactionId: 'abc',
        stageTimeline: [{ _id: 'sub-id-1', stage: 'search', status: 'ok' }],
      },
      labels
    );

    expect(html).not.toContain('_id');
    expect(html).not.toContain('buffer');
    expect(html).not.toContain('sub-id-1');
    expect(html).toContain('<b>interactionId:</b> abc');
    // stageTimeline's own compact value has _id already stripped, HTML-
    // escaped like any other value (the quotes read as &quot;).
    expect(html).toContain('&quot;stage&quot;:&quot;search&quot;');
  });

  it('renders a short plain-string value directly, with no <details>', () => {
    const html = buildMetadataCellHtml('a short note', labels);

    expect(html).toContain('a short note');
    expect(html).not.toContain('<details');
  });

  it('collapses a long plain-string value into a <details> using the keyless seeFullValueLabel', () => {
    const long = 'x'.repeat(301);
    const html = buildMetadataCellHtml(long, labels);

    expect(html).toContain('<details class="metadata-more">');
    expect(html).toContain('<summary>Full value</summary>');
    expect(html).toContain(long);
  });

  it('escapes HTML in both keys and values', () => {
    const html = buildMetadataCellHtml({ '<script>': '<img src=x onerror=alert(1)>' });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildStepTimeline', () => {
  it('builds a timeline from node logs and excludes persist from the visible steps', () => {
    const logs = [
      { createdAt: '2026-05-07T10:00:00.000Z', message: 'Starting GenericGraph' },
      { createdAt: '2026-05-07T10:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.200Z', message: 'node:init output' },
      { createdAt: '2026-05-07T10:00:00.300Z', message: 'node:answer input' },
      { createdAt: '2026-05-07T10:00:00.400Z', message: 'Tool execution completed: downloadWebPage', metadata: { duration: 50 } },
      { createdAt: '2026-05-07T10:00:00.500Z', message: 'node:answer output' },
      { createdAt: '2026-05-07T10:00:00.600Z', message: 'node:verify input' },
      { createdAt: '2026-05-07T10:00:00.700Z', message: 'node:verify output' },
      { createdAt: '2026-05-07T10:00:00.800Z', message: 'node:persist input' },
      { createdAt: '2026-05-07T10:00:00.900Z', message: 'node:persist output' },
      { createdAt: '2026-05-07T10:00:00.950Z', message: 'Workflow complete', metadata: { totalResponseTime: 800 } },
    ];

    const timeline = buildStepTimeline(logs);

    expect(timeline.graphName).toBe('GenericGraph');
    expect(timeline.totalMs).toBe(800);
    expect(timeline.userPerceivedMs).toBe(800);
    expect(timeline.steps.map((step) => step.name)).toEqual(['init', 'answer', 'verify']);

    const answerStep = timeline.steps.find((step) => step.name === 'answer');
    expect(answerStep.breakdown).toEqual({
      downloadCount: 1,
      downloadDuration: 50,
      generationDuration: 150,
    });
  });

  it('scopes to the latest starting run for a chat id', () => {
    const logs = [
      { createdAt: '2026-05-07T09:00:00.000Z', message: 'Starting OldGraph' },
      { createdAt: '2026-05-07T09:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.000Z', message: 'Starting NewGraph' },
      { createdAt: '2026-05-07T10:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.200Z', message: 'node:init output' },
    ];

    const timeline = buildStepTimeline(logs);

    expect(timeline.graphName).toBe('NewGraph');
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.steps[0].name).toBe('init');
    expect(timeline.steps[0].startRel).toBe(100);
  });
});
