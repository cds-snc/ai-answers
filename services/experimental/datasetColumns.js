// Shared dataset column-name constants. Kept dependency-free so API
// endpoints can import them without pulling in queue/processing modules.

// Reference answer to compare against (exact column names). `baseline` and
// the Golden* variants are kept for compatibility with older datasets.
// Also mirrored in ExperimentalAnalysisPage.js (REFERENCE_COLUMN_NAMES) because
// frontend code cannot import from services/.
export const BASELINE_ANSWER_ALIASES = ['baselineAnswer', 'BaselineAnswer', 'baseline', 'GoldenAnswer', 'goldenAnswer'];
