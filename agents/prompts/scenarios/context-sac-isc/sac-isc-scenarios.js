export const SAC_ISC_TOOL_REQUIREMENTS = `

### ⚠️ TOOL-REQUIRED TRIGGERS FOR SAC-ISC
These questions MUST trigger downloadWebPage before answering:

**Trigger: Contact Information (Phone/Address/Email/Office Locations)**
- When user asks: phone numbers, addresses, email, fax, regional offices, provincial offices, focal points, appointment booking, office hours, office location, "where is the office", "how do I contact"
- MUST download: https://raw.githubusercontent.com/cds-snc/ai-answers/isc-add-contacts/agents/prompts/scenarios/context-sac-isc/sac-isc-contacts.md
- Why: Contact details change frequently; sac-isc-contacts file supersedes ALL training data
- Special instructions:
  * If user's question is vague (e.g., "What is ISC's phone number?"), ask clarifying question to determine service/program needed
  * For regional office/focal point questions, ask about city/town/province to provide accurate response
  * Provide numbers and addresses in response once verified in downloaded content
  * NEVER provide contact information from memory or training data

**Trigger: Treaty Annuity Eligibility**
- When user asks: "Is [First Nation] eligible for treaty annuities?", "Does [band] get annuity payments?", band number eligibility, which First Nations receive treaty payments
- MUST download: https://www.sac-isc.gc.ca/eng/1595274954300/1595274980122
- Why: Band tables are authoritative source; must verify against current treaty tables
- Action: Search downloaded tables for Band number, First Nation name, and Region columns to verify eligibility
`;

export const SAC_ISC_SCENARIOS = `
### Questions about Indian status and secure status card processing time 
* Indian status is the legal standing of a person who is registered under the Indian Act. People can apply for registration and a secure status card at the same time.
* Questions about eligibility to register should be directed to the Find out if you are entitled to be registered under the Indian Act page: https://www.sac-isc.gc.ca/eng/1710868412176/1710868541374 https://www.sac-isc.gc.ca/fra/1710868412176/1710868541374
* Processing time for registration can take from 6 months to 2 years, depending on the complexity of the application.
* For people who are already registered under the Indian Act, it usually takes from 8 to 12 weeks to process a complete application for a secure status card. 
* If the question isn't clear about processing time for registration vs status card, ask a clarifying question so you can provide a helpful answer.
Processing time citations: https://www.sac-isc.gc.ca/eng/1710869258242/1710869294766 https://www.sac-isc.gc.ca/fra/1710869258242/1710869294766

### Status cards - no online applications or renewal available
* People registered under the Indian Act can download the application form and submit it by mail or in person.
* Make in-person submission appointment at regional office (see ⚠️ TOOL-REQUIRED section for contact information requirements).
* Mail-in applications should be sent to the National SCIS Processing Unit Refer to the Where to submit your application page https://www.sac-isc.gc.ca/eng/1695839818435/1695839847447 https://www.sac-isc.gc.ca/fra/1695839818435/1695839847447
* People can apply to renew their status card up to one year in advance. Eligibility for simplified renewal depends on several factors on this page: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 https://www.sac-isc.gc.ca/fra/1695840367366/1695840394948
* Individuals whose status cards have already expired cannot use the simplified renewal process.

### Indian status vs secure status card expiry
* If a user asks about renewing their Indian status, ask a clarifying question about whether they're asking about whether they want to renew their Indian status registration or their secure status card.
* An individual's Indian status never expires, but their status card does. Status card renewal citations: https://www.sac-isc.gc.ca/eng/1695840367366/1695840394948 https://www.sac-isc.gc.ca/fra/1695840367366/1695840394948

### Acceptable photos for Secure status card 
* People applying for or renewing a secure status card can submit 2 printed photos or use the SCIS Photo App, as described on this page: https://www.sac-isc.gc.ca/eng/1333474227679/1572461782133 https://www.sac-isc.gc.ca/fra/1333474227679/1572461782133

### Guarantor not usually required when renewing secure status card
* Important: Guarantor ONLY required if meet ANY ONE of three criteria: 
    1. mailing in a renewal which is not eligible for a simplified renewal; 
    2. ID providing with renewal doesn’t meet all valid acceptable identification requirements; 
    3. submitting a renewal in person on behalf of someone else. 
* if criteria aren't clear in user's question, NEVER attempt to answer, instead advise to use the About guarantors page https://www.sac-isc.gc.ca/eng/1517001167059/1572461679730 https://www.sac-isc.gc.ca/eng/1517001167059/1572461679730
* A guarantor for a child under 2 must be someone who has known the parent or legal guardian for at least 2 years. 

### Required documents
* Required documents to submit an application vary depending on the user's circumstances. If it is unclear whether the user is asking about required documents for registration vs status card, ask a clarifying question so you can provide a helpful answer.
* If the user is asking about the documents required to register under the Indian Act, the documents required are detailed here: https://www.sac-isc.gc.ca/eng/1710868681038/1710868708332
* If the user is asking about the documents required to get a secure status card, the documents required are detailed here: https://www.sac-isc.gc.ca/eng/1695838923064/1695838953647

### Jordan's Principle - no online applications available
* Individual and family application forms for Jordan's Principle can be downloaded from the website. Avoid providing direct links to application forms; instead, link to informational pages that establish eligibility to use the forms or ask the clarifying questions to determine the correct form and their eligibility. Only if the user's eligibility is clear from the conversation should a direct link to the correct application form for their situation be provided.
* Group application forms are not available on the website. People looking for a group application form must contact a regional focal point https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* How to submit a request via the Jordan's Principle Call Centre at 1-855-JP-CHILD (1-855-572-4453) or through a regional focal point https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387
* Regional focal point contact information: see ⚠️ TOOL-REQUIRED section for mandatory downloadWebPage requirements

### Jordan's Principle - what is covered
* What is covered under Jordan's Principle depends on the situation and needs of the First Nations child. Ce qui est couvert par le principe de Jordan dépend de la situation et des besoins de l'enfant des Premières Nations. Citations sur le principe de Jordan : Jordan's Principle coverage citations: https://www.sac-isc.gc.ca/eng/1568396296543/1582657596387#sec1 https://www.sac-isc.gc.ca/fra/1568396296543/1582657596387#sec1

###Inuit Child First Initiative
* Inuit children are not eligible for coverage under Jordan's Principle, but are supported under the Inuit Child First Initiative. Details about the Inuit Child First Initiative can be found on this page: https://www.sac-isc.gc.ca/eng/1536348095773/1536348148664 https://www.sac-isc.gc.ca/fra/1536348095773/1536348148664

### NIHB health benefits
* Physiotherapy is not covered under NIHB. La physiothérapie n'est pas couverte par les SSNA. https://www.sac-isc.gc.ca/eng/1572545056418/1572545109296 https://www.sac-isc.gc.ca/fra/1572545056418/1572545109296
* Eligible First Nations and Inuit clients do not need to apply for the NIHB program, but will need to show client identification to their health care provider to confirm their eligibility. They should ask if the provider will be able to submit the claim for payment directly to Express Scripts Canada. Les clients inuits et des Premières Nations admissibles n'ont pas besoin de présenter une demande au programme des SSNA, mais devront présenter une pièce d'identité à leur fournisseur de soins de santé pour confirmer leur admissibilité. Ils devraient demander si le fournisseur sera en mesure de soumettre la demande de paiement directement à Express Scripts Canada. https://www.sac-isc.gc.ca/eng/1577997945536/1577997969295 https://www.sac-isc.gc.ca/fra/1577997945536/1577997969295
* Clients 18 years or over are covered for a new set of corrective eyewear every 2 years. Clients under 18 years are covered for a new set of corrective eyewear every year. Les clients de 18 ans ou plus bénéficient d’une nouvelle paire de lunettes correctrices tous les 2 ans. Les clients de moins de 18 ans bénéficient d'une nouvelle paire de lunettes correctrices chaque année. https://www.sac-isc.gc.ca/eng/1579545788749/1579545817396 https://www.sac-isc.gc.ca/fra/1579545788749/1579545817396

###Dental benefits
* If a user asks about dental benefits, ask clarifying question about whether they are referring to NIHB Program dental benefits for eligible First Nations and Inuit or the Canadian Dental Care Plan (CDCP). Si un utilisateur pose des questions sur les prestations dentaires, posez une question de clarification pour savoir s'il fait référence aux prestations dentaires du Programme des SSNA pour les Premières Nations et les Inuits admissibles ou au Régime canadien de soins dentaires (RCDC). https://www.sac-isc.gc.ca/eng/1574192221735/1574192306943 https://www.sac-isc.gc.ca/fra/1574192221735/1574192306943
* If a user asks about dentists enrolled in the NIHB Program dental benefits for eligible First Nations and Inuit, direct them to contact their FNIHB regional office (see ⚠️ TOOL-REQUIRED section for contact information requirements). Si un utilisateur pose des questions sur les dentistes inscrits aux prestations dentaires du Programme des SSNA pour les Premières Nations et les Inuits admissibles, demandez-lui de contacter son bureau régional des SSNA. https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237 https://www.sac-isc.gc.ca/eng/1579274812116/1579708265237


### Valid identification for applications
* Valid acceptable identification needs to be issued by a federal, provincial, territorial or state government authority and valid, that is, not expired. To be considered acceptable, the valid identification needs to include the applicant's name, date of birth, photo and signature. https://www.sac-isc.gc.ca/eng/1516981589880/1572461616199 https://www.sac-isc.gc.ca/fra/1516981589880/1572461616199

### Getting an update on a status card application
* Questions about updates on a secure status card application or renewal, direct them to contact the Public Enquiries Contact Centre by phone or email.  https://www.sac-isc.gc.ca/eng/1291132820288/1603310905799 https://www.sac-isc.gc.ca/fra/1291132820288/1603310905799 
* The email address aadnc.infopubs.aandc@canada.ca is no longer in use and the correct email address for public enquiries is infopubs@sac-isc.gc.ca. https://www.sac-isc.gc.ca/eng/1291132820288/1603310905799 https://www.sac-isc.gc.ca/fra/1291132820288/1603310905799

###Community election systems
*ISC is never involved in elections held under community or custom election processes, nor will it interpret, decide on the validity of the process, or resolve election appeals. The department's role is limited to recording the election results provided by the First Nation. SAC n'intervient jamais dans les élections tenues selon un processus coutumier ou communautaire, pas plus qu'il n'interprète le processus et n'en détermine la validité ni ne règle les appels de résultats électoraux. Le rôle du ministère se limite à consigner le résultat de l'élection que lui fournit la Première Nation. https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### Tip for choosing French citation URLs on sac-isc.gc.ca
* URLS for French pages on sac-isc.gc.ca are the same as the English URLs, except for the language segments of /fra/ and /eng/. For example, the English page URL https://www.sac-isc.gc.ca/eng/1323195944486/1565366893158 matches this one in French: https://www.sac-isc.gc.ca/fra/1323195944486/1565366893158

### Cows and plows
* When users are asking about "cows and plows" payments, use the Specific claims page as the citation: https://www.rcaanc-cirnac.gc.ca/eng/1100100030291/1539617582343 https://www.rcaanc-cirnac.gc.ca/fra/1100100030291/1539617582343

### Drinking water advisories
* If a user asks about boil water advisories, ask a clarifying question whether they want to know about short-term or long-term drinking water advisories. https://www.sac-isc.gc.ca/eng/1100100034879/1521124927588 https://www.sac-isc.gc.ca/fra/1100100034879/1521124927588
`;