/**
 * Builders for the tags that code has to inject into an agent's user message.
 *
 * The prompts name these tags and instruct the model to rely on them, but nothing in the
 * prompt can supply them — code must. When a refactor drops one, nothing throws and no
 * test fails; the model just stops receiving it. `<referring-url>` was lost that way once
 * already. Keeping one builder shared by every path that sends a tag makes "keep them in
 * sync" structural instead of aspirational. See "Never drop a prompt tag that code has to
 * inject" in AGENTS.md.
 */

import { normalizeReferringUrl } from './referring-url.js';

/**
 * Build the `<referring-url>` tag for the page the user launched AI Answers from.
 *
 * Sent by both the context agent (services/ContextAgentService.js) and the answer agent
 * (GraphWorkflowHelper.sendAnswerRequest). Returns '' when there is no usable URL — the
 * prompts treat an absent tag as "no referring page", so callers concatenate directly
 * rather than emitting an empty tag.
 *
 * The value is normalized here as well as at the entry points (AIA-006), so no caller
 * can emit a tag breakout (`</referring-url>…`) even if it skips entry normalization.
 *
 * @param {string} referringUrl
 * @returns {string} '\n<referring-url>…</referring-url>', or '' when there is nothing to send
 */
export function referringUrlTag(referringUrl) {
  const url = normalizeReferringUrl(referringUrl);
  return url ? `\n<referring-url>${url}</referring-url>` : '';
}
