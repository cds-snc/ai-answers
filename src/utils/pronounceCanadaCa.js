import React from 'react';
import { spokenDot } from './citationAriaLabel.js';

// Screen readers vary in how they expand "Canada.ca" — some spell it out,
// some read the period as "point". Splitting it into a hidden visible span
// plus a sr-only phonetic span makes every screen reader say the same thing.
// The "dot"/"point" word itself comes from citationAriaLabel.js's spokenDot()
// so the two files can't drift on the same translation.
function spokenCanadaCa(lang) {
  return `Canada ${spokenDot(lang)} CA`;
}

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
  const spoken = spokenCanadaCa(lang);

  const nodes = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(CANADA_CA_RE)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <React.Fragment key={`canada-ca-${key++}`}>
        <span aria-hidden="true">Canada.ca</span>
        <span className="sr-only" lang={lang}>{spoken}</span>
      </React.Fragment>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// For elements whose accessible name must stay one atomic string — headings
// and links — computing the name from mixed inline content (visible text +
// an out-of-flow .sr-only span + aria-hidden span, as withCanadaCaPronunciation
// produces) can get exposed as separate accessible-tree nodes instead of one
// flat name, because .sr-only relies on position:absolute to hide visually.
// The safe pattern is: put the fully-substituted spoken string in aria-label
// on the container, and hide the entire visible rendering behind one
// aria-hidden span, so there is nothing for the accessible name to be
// computed from except the aria-label.
export function canadaCaAriaLabel(text, lang = 'en') {
  if (typeof text !== 'string' || !text.includes('Canada.ca')) return null;
  const spoken = spokenCanadaCa(lang);
  return text.replace(CANADA_CA_RE, spoken);
}

// For prose where per-match substitution leaves "Canada.ca" sitting visually
// adjacent to unrelated surrounding words (the sr-only span takes no layout
// space, so e.g. "Canada.ca Experience Office" reads/selects as one run even
// though only "Canada.ca" was meant to be substituted). aria-label isn't an
// option here either when the text is followed by a nested interactive
// element (a link) — aria-label on the container would hide that element
// from the accessibility tree. Instead, hide the *entire* passed-in string
// behind one aria-hidden span and pair it with one sr-only span carrying the
// fully-substituted phrase, so both the visible and spoken forms are each a
// single atomic run. Use this for a whole sentence/phrase around the
// mention, not for isolated "Canada.ca" substitution — for that, use
// withCanadaCaPronunciation.
export function withCanadaCaPronunciationBlock(text, lang = 'en') {
  const spoken = canadaCaAriaLabel(text, lang);
  if (!spoken) return text;
  return (
    <React.Fragment>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only" lang={lang}>{spoken}</span>
    </React.Fragment>
  );
}

// Shared implementation of the canadaCaAriaLabel atomic-name pattern (see the
// comment above canadaCaAriaLabel) for elements whose accessible name is a
// literal aria-label rather than derived from mixed content — headings,
// labels, links. Renders as `as` (default 'span'), forwarding any other
// props (className, href, htmlFor, ...) to it. Centralizes the
// aria-label/aria-hidden wiring so call sites don't each re-derive it.
export function CanadaCaAccessibleLabel({ as: As = 'span', text, lang = 'en', ...rest }) {
  const ariaLabel = canadaCaAriaLabel(text, lang);
  return (
    <As aria-label={ariaLabel || undefined} {...rest}>
      {ariaLabel ? <span aria-hidden="true">{text}</span> : text}
    </As>
  );
}
