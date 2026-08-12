import React from 'react';

// Hand-rolled to match GC DS's own gcds-error-summary visual styling (left
// border, heading, jump-link list) instead of using the real
// <gcds-error-summary> web component — same approach FeedbackInlineError
// already uses for the single-field error. Avoids two things the real
// component needs: shadow-DOM hydration (async, ~100ms) before it's
// focusable, and CSS-selector-based lookup for its links, which React's
// useId() values (containing colons) aren't safe for unescaped. A plain
// element lets us focus synchronously and resolve links with
// document.getElementById, no escaping needed.
const ExplanationErrorSummary = ({ id, heading, links, errorCount, inputRef }) => (
  <div key={errorCount} className="explanation-error-summary" id={id} role="alert" ref={inputRef} tabIndex={-1}>
    <h2 className="explanation-error-summary__heading">{heading}</h2>
    <ol className="explanation-error-summary__list">
      {links.map(({ fieldId, label }) => (
        <li key={fieldId}>
          <a
            href={`#${fieldId}`}
            onClick={(e) => {
              e.preventDefault();
              const target = document.getElementById(fieldId);
              if (!target) return;
              const label = target.closest('.explanation-field')?.querySelector('label');
              if (label && typeof label.scrollIntoView === 'function') {
                label.scrollIntoView({ block: 'center' });
              }
              target.focus();
            }}
          >
            {label}
          </a>
        </li>
      ))}
    </ol>
  </div>
);

export default ExplanationErrorSummary;
