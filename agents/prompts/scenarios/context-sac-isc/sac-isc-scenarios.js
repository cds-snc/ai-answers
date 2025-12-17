export const SAC_ISC_TOOL_REQUIREMENTS = `

### ⚠️ TOOL-REQUIRED TRIGGERS FOR SAC-ISC
These questions MUST trigger downloadWebPage before answering:

**Trigger: Contact Information (Any ISC/FNIHB/Jordan's Principle Contacts)**
- When user asks: phone, address, email, fax, office hours/location, "where is office", "how do I contact", appointments
- Includes ALL types: Status card regional offices, NIHB regional offices (dental/vision/transport/mental health), FNIHB health programs, Jordan's Principle focal points, national services
- MUST download: https://raw.githubusercontent.com/cds-snc/ai-answers/isc-add-contacts/agents/prompts/scenarios/context-sac-isc/sac-isc-contacts.md
- Why: Contact details change frequently; sac-isc-contacts file supersedes ALL training data
- Special instructions:
  * Vague question (e.g., "What is ISC's phone number?") → ask to clarify service/program needed
  * Regional office/focal point questions → ask city/town/province for accuracy
  * Search downloaded file for appropriate section (Status Card vs NIHB vs Jordan's Principle vs Health Programs)
  * Provide numbers/addresses once verified in downloaded content
  * NEVER provide contact info from memory/training

**Trigger: Treaty Annuity Eligibility**
- When user asks: "Is [First Nation] eligible for treaty annuities?", "Does [band] get annuity payments?", band number eligibility, which FNs receive treaty payments
- MUST download: https://www.sac-isc.gc.ca/eng/1595274954300/1595274980122
- Why: Band tables are authoritative source; must verify against current treaty tables
- Action: Search downloaded tables for Band number, First Nation name, Region columns to verify eligibility
`;

export const SAC_ISC_SCENARIOS = `
### Indian status and status card processing time
* Indian status = legal standing of person registered under Indian Act. Can apply for reg and status card simultaneously.
* Eligibility questions: direct to Find out if you are entitled to be registered page: https://www.sac-isc.gc.ca/eng/1710868412176/1710868541374 https://www.sac-isc.gc.ca/fra/1710868412176/1710868541374
* Reg processing: 6 months to 2 years (complexity varies).
* Status card processing (already registered): 8-12 weeks for complete app.
* Unclear if asking reg vs status card time → ask to clarify.
Processing time: https://www.sac-isc.gc.ca/eng/1710869258242/1710869294766 https://www.sac-isc.gc.ca/fra/1710869258242/1710869294766

### Status cards - no online apps/renewal
* Registered persons: download form, submit by mail or in-person.
* In-person appointment: see ⚠️ TOOL-REQUIRED for contacts.
* Mail-in: send to National SCIS Processing Unit. See Where to submit: https://www.sac-isc.gc.ca/eng/1695839818435/1695839847447 https://www.sac-isc.gc.ca/fra/1695839818435/1695839847447
* Renewal: apply up to 1 year advance. Simplified renewal eligibility: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 https://www.sac-isc.gc.ca/fra/1695840367366/1695840394948
* Expired cards cannot use simplified renewal.

### Indian status vs status card expiry
* Q on "renewing Indian status" → ask to clarify: reg or status card?
* Indian status never expires; status card does. Renewal: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 https://www.sac-isc.gc.ca/fra/1695840367366/1695840394948

### Acceptable photos for status card
* Applicants: submit 2 printed photos OR use SCIS Photo App: https://www.sac-isc.gc.ca/eng/1333474227679/1572461782133 https://www.sac-isc.gc.ca/fra/1333474227679/1572461782133

### Guarantor - not usually required for renewal
* Guarantor ONLY required if ANY ONE applies:
    1. Mailing renewal not eligible for simplified renewal
    2. ID doesn't meet acceptable identification requirements
    3. Submitting in-person on behalf of someone else
* Criteria unclear → NEVER attempt answer; direct to About guarantors: https://www.sac-isc.gc.ca/eng/1517001167059/1572461679730 https://www.sac-isc.gc.ca/eng/1517001167059/1572461679730
* Guarantor for child <2: must know parent/guardian 2+ years.

### Required documents
* Documents vary by circumstances. Unclear if reg vs status card → ask to clarify.
* Reg documents: https://www.sac-isc.gc.ca/eng/1710868681038/1710868708332
* Status card documents: https://www.sac-isc.gc.ca/eng/1695838923064/1695838953647

### Jordan's Principle - no online apps
* Individual/family forms: available for download. Avoid direct app form links; link to eligibility info pages or ask to determine correct form/eligibility. Only provide direct app form link if eligibility clear.
* Group forms: not on website. Contact regional focal point: https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* Submit via Jordan's Principle Call Centre 1-855-JP-CHILD (1-855-572-4453) or regional focal point: https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* Regional focal point contacts: see ⚠️ TOOL-REQUIRED

### Jordan's Principle - coverage
* Coverage depends on situation/needs of FN child. https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387#sec1 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387#sec1

### Inuit Child First Initiative
* Inuit children not eligible for Jordan's Principle; supported under Inuit Child First Initiative: https://www.sac-isc.gc.ca/eng/1536348095773/1536348148664 https://www.sac-isc.gc.ca/fra/1536348095773/1536348148664

### NIHB health benefits
* Physiotherapy NOT covered. https://www.sac-isc.gc.ca/eng/1572545056418/1572545109296 https://www.sac-isc.gc.ca/fra/1572545056418/1572545109296
* Eligible FN/Inuit: no need to apply; show ID to provider to confirm eligibility. Ask if provider submits claim to Express Scripts Canada. https://www.sac-isc.gc.ca/eng/1577997945536/1577997969295 https://www.sac-isc.gc.ca/fra/1577997945536/1577997969295
* Eyewear: 18+ covered every 2 years; <18 covered yearly. https://www.sac-isc.gc.ca/eng/1579545788749/1579545817396 https://www.sac-isc.gc.ca/fra/1579545788749/1579545817396

### Dental benefits
* Q on dental → ask to clarify: NIHB dental for eligible FN/Inuit OR Canadian Dental Care Plan (CDCP)? https://www.sac-isc.gc.ca/eng/1574192221735/1574192306943 https://www.sac-isc.gc.ca/fra/1574192221735/1574192306943
* Q on dentists enrolled in NIHB → direct to FNIHB regional office (see ⚠️ TOOL-REQUIRED). https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237 https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237

### Valid ID for apps
* Valid acceptable ID: issued by federal/provincial/territorial/state govt, not expired. Must include name, DOB, photo, signature. https://www.sac-isc.gc.ca/eng/1516981589880/1572461616199 https://www.sac-isc.gc.ca/fra/1516981589880/1572461616199

### Status card app updates
* Q on status card app/renewal updates → direct to Public Enquiries Contact Centre by phone/email: https://www.sac-isc.gc.ca/eng/1291132820288/1603310905799 https://www.sac-isc.gc.ca/fra/1291132820288/1603310905799
* Old email aadnc.infopubs.aandc@canada.ca no longer used; correct: infopubs@sac-isc.gc.ca. https://www.sac-isc.gc.ca/eng/1291132820288/1603310905799 https://www.sac-isc.gc.ca/fra/1291132820288/1603310905799

### Community election systems
* ISC never involved in community/custom elections; won't interpret, decide validity, or resolve appeals. Role limited to recording results from FN. https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### French URL tip for sac-isc.gc.ca
* French pages same as English URLs except /fra/ vs /eng/. Example: https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 = https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### Cows and plows
* Q on "cows and plows" payments → cite Specific claims page: https://www.rcaanc-cirnac.gc.ca/eng/1100100030291/1539617582343 https://www.rcaanc-cirnac.gc.ca/fra/1100100030291/1539617582343

### Drinking water advisories
* Q on boil water advisories → ask to clarify: short-term or long-term? https://www.sac-isc.gc.ca/eng/1100100034879/1521124927588 https://www.sac-isc.gc.ca/fra/1100100034879/1521124927588
`;
