// Display value for the partner dashboard's "Eval-informed answers"
// card: eval-informed answers as a share of questions answered by the
// eval-informed workflow (`metrics.evalInformed.informed.total` /
// `.eligible.total` from metrics-usage.js).
// Rounding alone would show 1 of 312 as "0 %" and 311 of 312 as "100 %",
// so those edges read "<1 %" / ">99 %". `fmtPct` is the page's
// locale-aware percent formatter.
export function formatEvalInformedRate(informed, eligible, fmtPct) {
  if (!(eligible > 0)) return '—';
  const pct = Math.round((informed / eligible) * 100);
  if (pct === 0 && informed > 0) return `<${fmtPct(1)}`;
  if (pct === 100 && informed < eligible) return `>${fmtPct(99)}`;
  return fmtPct(pct);
}

// The card's "From {date} only" label: the first eligible question's date,
// but only when it falls on a later day than the first question in range —
// i.e. the range starts before eval-informed answering did, so older
// questions are left out of the rate. Otherwise null (nothing left out).
export function getEvalInformedFromDate(firstEligibleDate, firstDataDate) {
  if (!firstEligibleDate || !firstDataDate) return null;
  const eligible = new Date(firstEligibleDate);
  const first = new Date(firstDataDate);
  if (Number.isNaN(eligible.getTime()) || Number.isNaN(first.getTime())) return null;
  return eligible.toDateString() !== first.toDateString() && eligible > first ? firstEligibleDate : null;
}
