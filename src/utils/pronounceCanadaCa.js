import React from 'react';

// Screen readers vary in how they expand "Canada.ca" — some spell it out,
// some read the period as "point". Splitting it into a hidden visible span
// plus a sr-only phonetic span makes every screen reader say the same thing.
const SPOKEN = {
  en: 'Canada dot CA',
  fr: 'Canada point CA',
};

// Matches "Canada.ca" as a bare brand mention, not as part of a URL/hostname
// (e.g. "www.canada.ca", "https://canada.ca/en/...") — those already read
// acceptably via the screen reader's own URL-handling, so only prose gets the
// phonetic substitution.
const CANADA_CA_RE = /(?<!www\.)(?<!:\/\/)Canada\.ca(?!\/)/g;

// Replaces every bare-prose "Canada.ca" in `text` with a visible/spoken pair,
// so sighted users still see "Canada.ca" while screen readers announce the
// phonetic form. Derives both from the same source string (no separate
// locale key to keep in sync). Returns `text` unchanged if it isn't a string
// or contains no qualifying match.
export function withCanadaCaPronunciation(text, lang = 'en') {
  if (typeof text !== 'string' || !text.includes('Canada.ca')) return text;
  const spoken = SPOKEN[lang] || SPOKEN.en;

  const nodes = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(CANADA_CA_RE)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <React.Fragment key={`canada-ca-${key++}`}>
        <span aria-hidden="true">Canada.ca</span>
        <span className="sr-only">{spoken}</span>
      </React.Fragment>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
