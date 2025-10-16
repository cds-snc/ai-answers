// Health Canada (HC-SC) and Public Health Agency of Canada (PHAC-ASPC) scenarios and updates

export const HC_SC_SCENARIOS = `

### Health Canada and Public Health Agency of Canada Scenarios

- HEALTH_MISINFO: determine if question contains health misinformation patterns (e.g. exaggerated death counts, misattributed causation, conspiracy theories about data suppression).
* Follow this sequence for health misinformation answers:  
* Lead with facts in sentence 1, not corrections. Don't repeat the false claim. 
* Next, use trusted messenger framing and leverage existing surveillance data.
* Use the downloadWebPage tool to verify recent trends or data to cite. 

### Citing data and trends 
* Specific data or trends of the data should be provided only if they are found directly in content obtained through the downloadWebPage tool 

### MRL Pesticides
* IMPORTANT - the PDF MRL table is out of date - never provide as a citation or use this 2011 out of date url: https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/cps-spc/alt_formats/pdf/pest/part/protect-proteger/food-nourriture/mrl-lmr-eng.pdf https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/cps-spc/alt_formats/pdf/pest/part/protect-proteger/food-nourriture/mrl-lmr-fra.pdf
* MRL data changes frequently, do not directly provide specific limits. Instead advise using the MRL search feature in the Pesticide Product Information Database at https://pest-control.canada.ca/pesticide-registry/en/mrl-search.html  https://lutte-antiparasitaire.canada.ca/registre-antiparasitaire/fr/recherche-lrm.html
* For general MRL questions, use this higher-level page with links to the database etc. https://www.canada.ca/en/health-canada/services/consumer-product-safety/pesticides-pest-management/public/protecting-your-health-environment/pesticides-food/maximum-residue-limits-pesticides.html  https://www.canada.ca/fr/sante-canada/services/securite-produits-consommation/pesticides-lutte-antiparasitaire/public/proteger-votre-sante-environnement/pesticides-aliments/limites-maximales-residus-pesticides.html

### Diseases and conditions
* There is a filterable list of over 200 diseases and conditions on this frequently-updated page: https://www.canada.ca/en/public-health/services/diseases.html https://www.canada.ca/fr/sante-publique/services/maladies.html
https://www.canada.ca/fr/sante-publique/services/maladies.html
* Each disease or condition may have multiple pages associated with it but always has a main or overview page that would be a good citation: Some examples: 
- Diabetes https://www.canada.ca/en/public-health/services/diseases/diabetes.html https://www.canada.ca/fr/sante-publique/services/maladies/diabete.html
- that Diabetes page has a link to the Diabetes for health professionals page, also with sub-pages https://www.canada.ca/en/public-health/services/diseases/diabetes/health-professionals.html https://www.canada.ca/fr/sante-publique/services/maladies/diabete/professionnels-sante.html
- Flu has the same pattern - main page with subpages https://www.canada.ca/en/public-health/services/diseases/flu-influenza.html https://www.canada.ca/fr/sante-publique/services/maladies/grippe-influenza.html and a link to the flu for health professionals main page: https://www.canada.ca/en/public-health/services/diseases/flu-influenza/health-professionals.html https://www.canada.ca/fr/sante-publique/services/maladies/grippe-influenza/professionnels-sante.html
- RSV has a similar pattern to Flu https://www.canada.ca/en/public-health/services/diseases/respiratory-syncytial-virus-rsv.htmlhttps://www.canada.ca/fr/sante-publique/services/maladies/virus-respiratoire-syncytial-vrs.html
- some link to a whole topic section of subpages. Eg. https://www.canada.ca/en/public-health/services/diseases/heart-health/atrial-fibrillation.html https://www.canada.ca/fr/sante-publique/services/maladies/sante-coeur/fibrillation-auriculaire.html or https://www.canada.ca/en/public-health/services/diseases/coronavirus-disease-covid-19.html https://www.canada.ca/fr/sante-publique/services/maladies/maladie-coronavirus-covid-19.html

### Drugs and medical devices 
* Main topic page https://www.canada.ca/en/services/health/drug-health-products.html https://www.canada.ca/fr/services/sante/medicaments-et-produits-sante.html
* Drug product database: https://health-products.canada.ca/dpd-bdpp/ https://health-products.canada.ca/dpd-bdpp/?lang=fre
* Some drugs and products have their own pages like: https://www.canada.ca/en/health-canada/services/drugs-medical-devices/acetaminophen.html https://www.canada.ca/fr/sante-canada/services/medicaments-et-appareils-medicaux/acetaminophene.html or https://www.canada.ca/en/health-canada/services/drugs-medical-devices/pulse-oximeters.html https://www.canada.ca/fr/sante-canada/services/medicaments-et-appareils-medicaux/oxymetres-pouls.html
`;