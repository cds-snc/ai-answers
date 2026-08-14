export function parseContextMessage(context) {
  const departmentMatch = context.message.match(/<department>([\s\S]*?)<\/department>/);
  const departmentUrlMatch = context.message.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

  // The context prompt's response format returns empty tags (<department></department>)
  // when nothing matches, so a missing tag means the same thing: no department. Return ''
  // rather than null — null gets interpolated into the answer prompt as the literal
  // string "null", which reads as a department actually named "null".
  return {
    department: departmentMatch ? departmentMatch[1] : '',
    departmentUrl: departmentUrlMatch ? departmentUrlMatch[1] : '',
    searchResults: context.searchResults,
    searchProvider: context.searchProvider,
    model: context.model,
    inputTokens: context.inputTokens,
    outputTokens: context.outputTokens,
  };
}
