// Experimental (docs/plans/coveo-passage-retrieval.md): the admin chat's passage tool option.
// '' (not listed) means off: today's tools. 'offered' adds retrievePassages for any question;
// 'forced' also makes it the agent's first tool call. Shared by ChatOptions and chat-graph-run.
export const PASSAGE_TOOL_CHAT_MODES = ['offered', 'forced'];
