// Answer types the answer pipeline may assign to an interaction. `normal` — and,
// defensively, an empty value, which the metrics pipelines already treat as
// normal — is a real answer attempt. The three below are not: an out-of-scope
// (not-gc), provincial/territorial/municipal (pt-muni), or clarifying-question
// turn carries no Government of Canada program. Program/action classification
// skips them and the program-volume metric excludes them, so the rule lives
// here once rather than being spelled out at each call site.
export const NON_NORMAL_ANSWER_TYPES = ['not-gc', 'pt-muni', 'clarifying-question'];

// Set form for O(1) membership checks (the classification skip path).
export const NON_CLASSIFIABLE_ANSWER_TYPES = new Set(NON_NORMAL_ANSWER_TYPES);
