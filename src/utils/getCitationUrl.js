// Resolves a message's citation URL across its two real shapes:
// - live, same-session message (before persistence): flat `interaction.citationUrl`,
//   set by the graph's verify node (agents/graphs/*.js) and streamed straight to the client.
// - reloaded/review-mode message (after persistence): `interaction.answer.citation.providedCitationUrl`,
//   populated from the Citation model by api/db/db-chat.js.
// `interaction.answer.providedCitationUrl` is not a real shape — Citation has always been its
// own referenced model, never flattened onto Answer — so it's deliberately not checked here.
export function getCitationUrl(interaction) {
  return interaction?.citationUrl
    || interaction?.answer?.citation?.providedCitationUrl
    || '';
}
