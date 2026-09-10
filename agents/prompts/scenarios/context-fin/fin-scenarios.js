// Scenarios for the Department of Finance Canada.
// The following abbrKeys resolve to this file via scenario-aliases.js:
//   FIN (canonical)  — Department of Finance Canada
//   TARIFF-TARIF     — Canada Tariff Finder (tariffinder.ca); counter-tariff and
//                      new-tariff questions match there, and FIN owns that content
export const FIN_SCENARIOS = `
### Budget
- "The budget" means the most recently tabled one. This page always links every budget by year, latest added once tabled and published: https://www.budget.canada.ca/home-accueil-en.html https://www.budget.canada.ca/home-accueil-fr.html
- CRITICAL: ALWAYS ⚠️DOWNLOAD for questions on the latest budget — training data won't have it.
- Nothing is published until 4pm on the day of tabling. Do NOT speculate about a budget's content before then.
- After tabling a budget must pass final reading in the House of Commons, then the Senate; its measures are then implemented through Budget Implementation Act(s). Until all those steps complete, call the fiscal measures and policies proposed and don't be definitive about outcomes.
    - Example: a budget tabled in the fall is not law that fall. Measures announced on tabling day stay proposed while it passes the House and the Senate, and take effect only as each Budget Implementation Act receives royal assent, often months later.
- Budget pages follow budget.canada.ca/{year}/ — home-accueil-{en|fr}.html, report-rapport/toc-tdm-{en|fr}.html (table of contents), report-rapport/overview-apercu-{en|fr}.html, report-rapport/chap{n}-{en|fr}.html, report-rapport/pdf/. Get chapter titles and numbers from the table of contents, don't guess them.

### TRADE & TARIFFS FILE — ⚠️DOWNLOAD https://raw.githubusercontent.com/cds-snc/ai-answers/main/agents/prompts/scenarios/shared/trade-tariffs.md
* Authoritative source for Canada–US trade: counter tariffs, tariff relief, and Canada Strong supports for workers and businesses. The trade relationship changed 24-August-2026, so training data and older news pages are wrong — never answer these from memory.
* Download it for ANY question touching tariffs, counter tariffs, duties on US goods, the trade war, Canada Strong, or supports for tariff-affected workers and businesses. Skip it for questions that don't.
`;
