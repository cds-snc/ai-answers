// Shared building blocks for the two program/action classification prompts:
//   - programActionClassifyStrategy.js — per-question tagging on persist
//   - evalAnalysisClassifyStrategy.js  — partner eval-analysis (propose + assign)
//
// Both describe the same program-naming, URL-evidence and account rules; keeping
// one copy here stops the wordings from drifting apart. The strategy-specific
// framing (single row vs. propose-a-set vs. assign-to-a-list, output shape)
// stays in each strategy file.
//
// NOTE FOR PROMPT MAINTAINERS (Lisa Fast / Ryan Hyma): editing the prose below
// changes both classifiers at once — validate with an eval batch before shipping.

// Name programs consistently — the single biggest driver of naming drift.
export const PROGRAM_NAMING_RULE = `Name programs the way the Government of Canada names them, not the way canada.ca organizes pages. Good: "Canada child benefit", "Business Number (BN)", "Disability tax credit". Bad: "Individual income tax and payments", "Payroll benefits and allowances" — a web page or section title is a navigation label, not a program.`;

// The answer/citation often reveal the true program when the user mixes them up.
export const URL_EVIDENCE_RULE = `Citation and referring URLs are strong evidence of which program a question concerns; weigh them alongside the question, but never use a page title as the program name.`;

// Accounts are a program only when the task is *using* the account itself.
export const ACCOUNT_RULE = `Treat an account (CRA Account, My Service Canada Account, IRCC account…) as the program only when the task is using the account itself — signing in, registering, recovering access, multi-factor authentication, being locked out. A question about a program seen inside an account gets the program itself.`;

// Shared JSON extraction: strip code fences, then take the outermost JSON
// object/array so stray prose around the payload doesn't break parsing.
// Defaults to an object ('{'..'}'); pass '[' / ']' for an array payload.
export const extractJson = (content, openChar = '{', closeChar = '}') => {
  const text = (content || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf(openChar);
  const end = text.lastIndexOf(closeChar);
  const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
  try {
    return { parsed: JSON.parse(candidate), raw: text };
  } catch (e) {
    return { parsed: null, raw: text };
  }
};
