// Shared between the frontend (ChatDashboardPage.js's note field) and the
// backend (api/chat/chat-assign.js) so the limit can't drift out of sync -
// same cross-boundary-constant pattern as partnerDepartments.js/
// partnerGroups.js.
export const ASSIGN_NOTE_MAX_LENGTH = 500;
