// Shared scenario file for the Defence portfolio. Loaded whenever the
// context agent matches any of these abbrKeys (see scenario-aliases.js):
//
//   CFHA-ALFC    Canadian Forces Housing Agency
//   DCC-CDC      Defence Construction Canada
//   DIA-AID      Defence Investment Agency
//   DND-MDN      National Defence (canonical)
//   DRDC-RDDC    Defence Research and Development Canada
//   IRPDA-CIEAD  Independent Review Panel for Defence Acquisition
//   ONDCAF       Office of the Ombudsman for DND and the Canadian Armed Forces
export const DND_MDN_SCENARIOS = `
## Transition to post-military life
### For ALL military transitions-related questions, ⚠️DOWNLOAD and use this authoritative source of instructions to ensure accurate responses: https://raw.githubusercontent.com/cds-snc/ai-answers/main/agents/prompts/scenarios/context-dnd-mdn/dnd-mdn-transition-scenarios.md
* Instructions include military transitions content including:
- leaving service, next steps, events, transition centres
- Medical support/return to duty, casualty support for members/families in illness, injury or death
- Interim Reconstitution Employment Measure (IREM) 
- voluntary, compulsory (medical), and Reserve Force release from CAF & component transfers from/to  Primary & Supplementary Reserve
- Retention & benefits/options of remaining in CAF  https://military-transition.canada.ca/en/remain https://military-transition.canada.ca/fr/rester/retention

* Careers/recruiting https://forces.ca/en/careers https://forces.ca/fr/carrieres

## Benefits, pay, services
* topic https://www.canada.ca/en/government/publicservice/benefitsmilitary.html https://www.canada.ca/fr/gouvernement/fonctionpublique/avantagesmilitaires.html
* pay https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/pay.html https://www.canada.ca/fr/ministere-defense-nationale/services/avantages-militaires/solde-pension-indemnites/solde.html
* medical and dental CAF members https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/medical-dental.html https://www.canada.ca/fr/ministere-defense-nationale/services/avantages-militaires/solde-pension-indemnites/prestations/medicales-dentaires.html

## Defence organizations
* CAF/FAC https://www.canada.ca/en/services/defence/caf.html https://www.canada.ca/fr/services/defense/fac.html
* Defence construction Canada, crown corporation https://www.dcc-cdc.gc.ca/ https://www.cdc-dcc.gc.ca/
* Defence investment agency - a special operating agency within Public Services and Procurement Canada https://www.canada.ca/en/defence-investment-agency.html https://www.canada.ca/fr/agence-investissement-defense.html
* Bureau of Research, Engineering and Advanced Leadership in Innovation and Science (BOREALIS) https://www.canada.ca/en/department-national-defence/programs/borealis.html https://www.canada.ca/fr/ministere-defense-nationale/programmes/borealis.html
* Defence Research and Development Canada -develop/deliver new technical solutions and advice https://www.canada.ca/en/defence-research-development.html https://www.canada.ca/fr/recherche-developpement-defense.html
* Independent Review Panel for Defence Acquisition https://www.canada.ca/en/independent-review-panel-defence-acquisition.html https://www.canada.ca/fr/commission-independante-examen-acquisitions-defense.html
`;
