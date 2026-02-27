export const SAC_ISC_SCENARIOS = `

### French URL tip for sac-isc.gc.ca:
* French pages same as English URLs except /fra/ vs /eng/. Example: https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 → https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### CONTACTS: ⚠️DOWNLOAD https://raw.githubusercontent.com/cds-snc/ai-answers/isc-add-contacts/agents/prompts/scenarios/context-sac-isc/sac-isc-contacts.md**
- When user asks for: phone, address, email, fax, office hours/location, status card in-person appointments, status card application status/updates 
- Page has ALL contact types: Status card regional offices, NIHB regional offices (dental/vision/transport/mental health), FNIHB health programs, Jordan's Principle focal points, national services, public enquiries contact centre
- Why: Contact details change frequently; sac-isc-contacts file supersedes ALL training data

### TREATY ANNUITY: ⚠️DOWNLOAD https://www.sac-isc.gc.ca/eng/1595274954300/1595274980122
- When user asks: "Is [First Nation] eligible for treaty annuities?", "Does [band] get annuity payments?", band number eligibility, which FNs receive treaty payments
- Why: Band tables are authoritative source; must verify against current treaty tables

### Indian status and status card 
* Indian status = legal standing of person registered under Indian Act. Can apply for reg and status card simultaneously.
* Eligibility questions: don't answer → advise to answer questions on Find out if you are entitled to be registered : https://www.sac-isc.gc.ca/eng/1710868412176/1710868541374 
* Reg processing: 6 months to 2 years (complexity varies).
* Status card processing (already registered): 8-12 weeks for complete app.
* Unclear if asking reg vs status card time → ask to clarify.
* Card holder can check if card still valid per https://www.sac-isc.gc.ca/eng/1100100032424/1572461852643
* Organizations can check customer/client card valid by phone/email ⚠️DOWNLOAD https://www.sac-isc.gc.ca/eng/1100100032405/1572461328003
* Processing time: https://www.sac-isc.gc.ca/eng/1710869258242/1710869294766 

### Status cards - no online apps/renewal
* Registered persons: download form, submit by mail or in-person only with photo and all documents, no email or online.
* In-person appointment and mailing address: see ⚠️DOWNLOAD for contacts.
* Mail-in: send to National SCIS Processing Unit. See Where to submit: https://www.sac-isc.gc.ca/eng/1695839818435/1695839847447 
* Renewal: apply up to 1 year advance. Simplified renewal eligibility: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 
* Expired cards cannot use simplified renewal.

### Indian status vs status card expiry
* Q on "renewing Indian status" → ask to clarify: reg or status card?
* Indian status never expires; status card does. Renewal: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 

### Acceptable photos for status card
* Applicants: submit 2 printed photos OR use SCIS Photo App: https://www.sac-isc.gc.ca/eng/1333474227679/1572461782133 

### Guarantor - not usually required for renewal
* Guarantor ONLY required if ANY ONE applies:
    1. Mailing renewal not eligible for simplified renewal
    2. ID doesn't meet acceptable identification requirements
    3. Submitting in-person on behalf of someone else
* Criteria unclear → NEVER attempt answer; direct to About guarantors: https://www.sac-isc.gc.ca/eng/1517001167059/1572461679730 
* Guarantor for child <2: must know parent/guardian 2+ years.

### Finding band number
* First 3 digits of registration number on secure status card identify the First Nation, or band, with which someone is affiliated https://www.sac-isc.gc.ca/eng/1710869258242/1710869294766

### Required documents/ID 
* Documents vary by circumstances. Unclear if reg vs status card → ask to clarify.
* Reg documents: https://www.sac-isc.gc.ca/eng/1710868681038/1710868708332
* Status card documents: https://www.sac-isc.gc.ca/eng/1695838923064/1695838953647
* Valid acceptable ID: issued by federal/provincial/territorial/state govt, not expired. Must include name, DOB, photo, signature. https://www.sac-isc.gc.ca/eng/1516981589880/1572461616199 https://www.sac-isc.gc.ca/fra/1516981589880/1572461616199

### Jordan's Principle - no online apps
* Individual/family forms: available for download. Avoid direct app form links; link to eligibility info pages or ask to determine correct form/eligibility. Only provide direct app form link if eligibility clear.
* Group forms: not on website. Contact regional focal point: https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* Submit via Jordan's Principle Call Centre 1-855-JP-CHILD (1-855-572-4453) or regional focal point: https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* Regional focal point contacts: see ⚠️DOWNLOAD

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
* Q on dentists enrolled in NIHB → direct to appropriate FNIHB regional office (see ⚠️DOWNLOAD). https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237 https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237

### Community election systems
* ISC never involved in community/custom elections; won't interpret, decide validity, or resolve appeals. Role limited to recording results from FN. https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### Cows and plows
* Q on "cows and plows" payments → cite Specific claims page: https://www.rcaanc-cirnac.gc.ca/eng/1100100030291/1539617582343 https://www.rcaanc-cirnac.gc.ca/fra/1100100030291/1539617582343

### Drinking water advisories
* Q on dif short vs long-term advisories? Explained:  https://www.sac-isc.gc.ca/eng/1538160229321/1538160276874
* Q on particular advisory is short- or long-term? frequent updates ⚠️DOWNLOAD. Short term list  https://www.sac-isc.gc.ca/eng/1562856509704/1562856530304 vs long-term list: https://www.sac-isc.gc.ca/eng/1614387410146/1614387435325

### MMIWG 2 separate days, awareness vs action
- October 4th: National Day of Action for Missing and Murdered Indigenous Women, Girls and 2SLGBTQI+ People (Sisters in Spirit Day) https://www.canada.ca/en/crown-indigenous-relations-northern-affairs/news/2025/10/ministers-alty-gull-masty-chartrand-and-valdez-issue-a-statement-of-support-on-sisters-in-spirit-day-and-the-national-day-of-action-for-missing-and.html
- May 5th: National Day of Awareness for for MMIWG2S+ (Red Dress Day) https://cihr-irsc.gc.ca/e/52964.html https://cihr-irsc.gc.ca/f/52964.html

<examples>
<example>
   <english-question> What number should I call for status card appointment if I'm in Ottawa?? </english-question>
   [Agent calls downloadWebPage with URL: https://raw.githubusercontent.com/cds-snc/ai-answers/isc-add-contacts/agents/prompts/scenarios/context-sac-isc/sac-isc-contacts.md - finds Ontario status card regional office in National Capital Region number, service hours, notes and url]
   <english-answer><s-1>Call 819-664-2962 to make an appointment or find out if walk-ins are available</s-1><s-2>You can also save time and book an appointment online for this Gatineau location.</s-2> <s-3>Service hours are Monday to Friday, 8 am to 3:30 pm Eastern time.</s-3><s-4>The status card service kiosk location in the National Capital Region is: 1 Promenade du Portage, Central Building, Terrasses de la Chaudière, Gatineau, QC.</s-4></english-answer>
    <citation-url>https://www.sac-isc.gc.ca/eng/1603370021929/1603370103408</citation-url>
</example>
<example>
   <english-question> I need to call to arrange medical transportation in Thunder Bay. </english-question>
   [Agent calls downloadWebPage with URL: https://raw.githubusercontent.com/cds-snc/ai-answers/isc-add-contacts/agents/prompts/scenarios/context-sac-isc/sac-isc-contacts.md - finds NIHB Ontario Transport Thunder Bay phone numbers and after hours number]
   <english-answer><s-1>Call the NIHB Thunder Bay office at 1-807-343-5390 or toll-free 1-877-779-7749.</s-1><s-2>If this is an emergency on a weekday after 4 pm, weekend or statutory holidays, call toll- free: 1-833-675-3081 to arrange medical transportation.</s-2></english-answer>
    <citation-url>https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237</citation-url> 
</example>
</examples>
`;
