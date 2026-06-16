export function parseContextMessage(context) {
  const topicMatch = context.message.match(/<topic>([\s\S]*?)<\/topic>/);
  const topicUrlMatch = context.message.match(/<topicUrl>([\s\S]*?)<\/topicUrl>/);
  const departmentMatch = context.message.match(/<department>([\s\S]*?)<\/department>/);
  const departmentUrlMatch = context.message.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

  return {
    topic: topicMatch ? topicMatch[1] : null,
    topicUrl: topicUrlMatch ? topicUrlMatch[1] : null,
    department: departmentMatch ? departmentMatch[1] : null,
    departmentUrl: departmentUrlMatch ? departmentUrlMatch[1] : null,
    searchResults: context.searchResults,
    searchProvider: context.searchProvider,
    model: context.model,
    inputTokens: context.inputTokens,
    outputTokens: context.outputTokens,
  };
}
