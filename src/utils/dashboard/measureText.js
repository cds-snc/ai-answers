// Canvas-based text-width measurement for the Y-axis label wrapping in
// HBarCard.js/DivergingBarCard.js. Those used to estimate how many
// characters fit per line from a fixed average-char-width constant — proven
// repeatedly wrong for a proportional font (7.0 → 8.0 → +8% safety margin
// still clipped real labels like "Performance management program" and
// "Saved me time searching and reading"), since any single average is only
// ever right for strings with an average mix of narrow/wide characters.
// This measures the actual rendered width via the browser's own font
// metrics instead of guessing, so wrapping decisions are exact rather than
// approximate.
let canvas = null;

// Must match the Y-axis tick text's real rendered font — see renderYTick in
// both chart components (fontSize 16, fill aside; font-family isn't set
// explicitly there, so it inherits the page's default, 'Noto Sans' per GC DS
// — same font this whole dashboard is built on).
const TICK_FONT = '16px "Noto Sans", sans-serif';

export const measureTextWidth = (text) => {
  if (typeof document === 'undefined') return (text || '').length * 8; // SSR/test fallback
  if (!canvas) canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = TICK_FONT;
  return ctx.measureText(text || '').width;
};

export default measureTextWidth;
