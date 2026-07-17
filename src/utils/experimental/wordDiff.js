/**
 * Word-level diff between two texts, used to highlight how a generated
 * answer deviates from the reference answer.
 *
 * Pure utility — no React, no state.
 */

// Above this many tokens per side, skip the O(n*m) LCS and return the
// two texts as single unchanged/changed blocks.
const MAX_TOKENS = 3000;

// Strip sentence markers the pipeline may add (e.g. <s-1>...</s-1>) and
// collapse whitespace so formatting noise doesn't show up as a diff.
export const normalizeAnswerText = (text) => String(text || '')
    .replace(/<\/?s-\d+>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text) => (text ? text.split(' ') : []);

/**
 * Compute a word diff between a baseline (golden) text and a current text.
 *
 * @returns {Array<{ type: 'same' | 'added' | 'removed', text: string }>}
 *   Segments in reading order. 'removed' = present only in baseline,
 *   'added' = present only in current.
 */
export function wordDiff(baselineText, currentText) {
    const baseline = normalizeAnswerText(baselineText);
    const current = normalizeAnswerText(currentText);

    if (baseline === current) {
        return baseline ? [{ type: 'same', text: baseline }] : [];
    }
    if (!baseline) return [{ type: 'added', text: current }];
    if (!current) return [{ type: 'removed', text: baseline }];

    const a = tokenize(baseline);
    const b = tokenize(current);

    if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
        return [
            { type: 'removed', text: baseline },
            { type: 'added', text: current }
        ];
    }

    // LCS table (lengths only)
    const rows = a.length + 1;
    const cols = b.length + 1;
    const lcs = Array.from({ length: rows }, () => new Uint32Array(cols));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    // Walk the table, merging consecutive tokens of the same type.
    const segments = [];
    const push = (type, token) => {
        const last = segments[segments.length - 1];
        if (last && last.type === type) {
            last.text += ` ${token}`;
        } else {
            segments.push({ type, text: token });
        }
    };

    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            push('same', a[i]);
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            push('removed', a[i]);
            i++;
        } else {
            push('added', b[j]);
            j++;
        }
    }
    while (i < a.length) push('removed', a[i++]);
    while (j < b.length) push('added', b[j++]);

    return segments;
}

export default wordDiff;
