import { describe, it, expect } from 'vitest';
import { parseContextMessage } from '../contextService.js';

const parse = (message) => parseContextMessage({ message, searchResults: '' });

describe('parseContextMessage', () => {
  it('extracts department and departmentUrl from a match', () => {
    const parsed = parse(`<analysis>
<department>PrairiesCan</department>
<departmentUrl>https://www.canada.ca/en/prairies-economic-development.html</departmentUrl>
</analysis>`);

    expect(parsed.department).toBe('PrairiesCan');
    expect(parsed.departmentUrl).toBe(
      'https://www.canada.ca/en/prairies-economic-development.html'
    );
  });

  // contextSystemPrompt.js tells the agent to return empty tags when nothing matches
  // (see the "recipe ideas" example in its <examples> block).
  it('returns empty strings for the prompt\'s documented no-match response', () => {
    const parsed = parse(`<analysis>
<department></department>
<departmentUrl></departmentUrl>
</analysis>`);

    expect(parsed.department).toBe('');
    expect(parsed.departmentUrl).toBe('');
  });

  // A missing tag means the same thing as an empty one: no department. It must not
  // become null, which interpolates into the answer prompt as the string "null".
  it.each([
    ['an empty response', ''],
    ['a response with no tags at all', 'No messages available'],
    ['a malformed response', '<analysis>garbled'],
  ])('returns empty strings, never null, for %s', (_label, message) => {
    const parsed = parse(message);

    expect(parsed.department).toBe('');
    expect(parsed.departmentUrl).toBe('');
    expect(parsed.department).not.toBeNull();
    expect(parsed.departmentUrl).not.toBeNull();
  });
});
