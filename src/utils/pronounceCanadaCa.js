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

// For elements whose accessible name must stay one atomic string — headings,
// labels, links — computing the name from mixed inline content (visible text
// plus an out-of-flow .sr-only span) can get exposed as separate
// accessible-tree nodes instead of one flat name, since .sr-only relies on
// position:absolute to hide visually. The safe pattern is: put the
// fully-substituted spoken string in aria-label on the container, and hide
// the entire visible rendering behind one aria-hidden span, so there is
// nothing for the accessible name to be computed from except the aria-label.
export function canadaCaAriaLabel(text, lang = 'en') {
  if (typeof text !== 'string' || !text.includes('Canada.ca')) return null;
  const spoken = spokenCanadaCa(lang);
  return text.replace(CANADA_CA_RE, spoken);
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
    // {...rest} spreads before aria-label so the computed value always wins,
    // even if a caller's props happen to include their own aria-label.
    <As {...rest} aria-label={ariaLabel || undefined}>
      {ariaLabel ? <span aria-hidden="true">{text}</span> : text}
    </As>
  );
}
