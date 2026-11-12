// Service profiles: one plain config object per service built on AI Answers.
// The server picks a chat's profile; graph nodes read its fields and never
// check the profile id. See docs/plans/canadalogin-assistant.md §1a.
//
// `default` is regular AI Answers and must reproduce today's behaviour exactly.

export const DEFAULT_SERVICE_PROFILE_ID = 'default';

const SERVICE_PROFILES = {
  [DEFAULT_SERVICE_PROFILE_ID]: {
    id: DEFAULT_SERVICE_PROFILE_ID,
    // The client's cap is MAX_CONVERSATION_TURNS in
    // src/components/chat/ChatAppContainer.js. Keep the two in sync until the
    // client reads the cap from the server.
    maxTurns: 3,
  },
};

// Fail fast: an unknown or missing id is a bug, never a silent fallback to
// `default`.
export function getServiceProfile(id) {
  if (!Object.hasOwn(SERVICE_PROFILES, id)) {
    throw new Error(`Unknown service profile: ${String(id)}`);
  }
  return SERVICE_PROFILES[id];
}
