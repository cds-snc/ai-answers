import { escapeHtml } from '../htmlEscape.js';

// Partner/AI Eval columns' pill markup. The base value (correct/
// needsImprovement/hasError/harmful) is its own pill; hasCitationError and
// (partner only) hasContentIssue are independent boolean flags that stack
// alongside it rather than being folded into the base value - see
// getHasCitationErrorAggregationExpression / getPartnerContentIssueAggregationExpression
// in api/util/chat-filters.js for why. One shared builder for both columns
// so the two don't drift out of sync with each other.
//
// harmful is the one exception to stacking: it suppresses every other pill
// rather than joining them. An answer flagged harmful can also happen to
// have a content issue or a citation issue on the same sentence data, but
// harmful is severe enough on its own that showing it alongside "citation
// issue"/"content issue" reads as understating it, not adding detail.
export const buildEvalPillsHtml = (t, value, extraFlags = []) => {
  let html = '';
  if (value) {
    const label = t(`admin.chatDashboard.labels.evaluation.${value}`);
    html += `<span class="label ${escapeHtml(value)}">${escapeHtml(label.includes('.') ? value : label)}</span>`;
  }
  if (value !== 'harmful') {
    extraFlags.forEach(({ active, className, labelKey }) => {
      if (!active) return;
      const label = t(labelKey);
      html += `<span class="label ${className}">${escapeHtml(label)}</span>`;
    });
  }
  if (!html) return html;
  // Wrapped in a flex container (see .eval-pills-wrap in admin.css) rather
  // than relying on .label + .label's margin-left for spacing: when two
  // pills don't fit on one line, that margin wraps down with the second
  // pill instead of resetting, so it reads as indented rather than
  // flush-left on its own row. flex + gap spaces pills correctly on both
  // the same line and across a wrap.
  return `<span class="eval-pills-wrap">${html}</span>`;
};
