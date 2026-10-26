// Display-only French labels for stored (English) program/action values.
// Programs and actions are always classified and stored in English; these
// helpers translate a stored value for French admins/partners at the display
// boundary (same pattern as programFr on the partner dashboard). They return
// '' when there is no French mapping so callers can fall back to English.
//
// Server-side only: getAllProgramNameMap reads the curated .md files from disk.
import { getAllProgramNameMap } from '../data/programSeedsLoader.js';
import { ACTION_FR } from '../data/programActionSeeds.js';

export const frForProgram = (program) => (program && getAllProgramNameMap().get(program)) || '';
export const frForAction = (action) => (action && ACTION_FR[action]) || '';
