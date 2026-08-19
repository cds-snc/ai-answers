# FedDev Ontario services

<!-- "FedDev Ontario" below is the agency's official bilingual brand name as it
     appears on canada.ca — keep it as-is in this file, space and all.
     The app's internal abbrKey uses a hyphen instead ("FedDev-Ontario", in
     departments_EN.js/FR.js and the department-key lists/validators) because
     requireLiteralString's default validation pattern (api/util/db-query.js)
     rejects spaces — the space in the abbrKey used to 400/500 every
     scenario-override and eval-analysis request for this department. The
     hyphen is a code-identifier workaround for that validator, not a brand
     change, so it doesn't belong in this file's actual service names. -->

Curated list of the Federal Economic Development Agency for Southern Ontario services used to keep
service tagging consistent across questions. One service per row.

FedDev Ontario is part of the ISED portfolio but has its own scenario folder, so its
services are curated here rather than in `context-ised-isde/ised-isde-services.md`.
The rows below were seeded from the programs named in `feddev-ontario-scenarios.js`.
Business Benefits Finder is ISED's service, kept here because the scenarios
redirect to it whenever no regional funding fits the question.

**How to edit (for partners):**
- Add a row for a missing service; remove one that doesn't apply.
- Keep the two columns: **English** name, then the official **Français** name.
- Use the official Government of Canada service name (as it appears on canada.ca),
  not a web-page or section title.
- Keep the header row and the `|---|---|` separator line intact.

The English names anchor the classifier; the French names are used for display to
French users. Both are stored exactly as written here.

| English | Français |
|---|---|
| Build Communities Strong Fund – Local Impact Stream | Fonds pour bâtir des collectivités fortes – volet Impacts locaux |
| Business Benefits Finder | Repérage des avantages pour les entreprises |
| Federal Economic Development Agency for Southern Ontario (FedDev Ontario) | Agence fédérale de développement économique pour le Sud de l'Ontario (FedDev Ontario) |
| Regional Defence Investment Initiative | Initiative régionale d'investissement pour la défense |
| Regional Tariff Response Initiative | Initiative régionale de réponse tarifaire |
| Small Business Services | Services aux petites entreprises |
