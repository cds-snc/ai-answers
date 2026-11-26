// Splits the model-facing search results text (agents/tools/*ContextSearch.js:
// "Title: …\nLink: …\nSummary: …", results separated by a blank line) into
// [[{ label, value }, …], …]. Returns null for any other text (e.g. "No
// results found.") so the caller shows it as-is.
export function parseSearchResults(text, labels) {
  const linePattern = new RegExp(`^(${labels.join('|')}): ?(.*)$`);
  const results = text.trim().split(/\n\s*\n/).map((block) => block.split('\n').map((line) => {
    const match = line.match(linePattern);
    return match ? { label: match[1], value: match[2] } : null;
  }));
  return results.every((fields) => fields.every(Boolean)) ? results : null;
}
