# ISED-ISDE services

Curated list of Innovation, Science and Economic Development Canada services used
to keep service tagging consistent across questions. One service per row.

This file also covers the ISED **portfolio organizations** that share ISED's
scenario folder via `scenario-aliases.js` — the regional development agencies
ACOA, CED-QR and CanNor, the Canadian Intellectual Property Office (CIPO-OPIC),
the Communications Research Centre (CRC), the Competition Bureau (COBU-BUCO),
Measurement Canada (MC), and the Office of the Superintendent of Bankruptcy
(OSB-BSF) — add their services here too.

The other four regional development agencies — FedDev Ontario, FedNor, PacifiCan
and PrairiesCan — are partners with their own scenario folders; their services
belong in `context-feddev-ontario/`, `context-fednor/`, `context-pacifican/` and
`context-prairiescan/` respectively, not here.

Health Emergency Readiness Canada (HERC-PCSC) is also listed as a service, but it
is **not yet aliased**: it has no abbrKey in `departments_EN.js`/`departments_FR.js`,
so the context node can't match it. Add it there and to `scenario-aliases.js`
(→ ISED-ISDE) once it's registered as a department.

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
| Business Benefits Finder | Repérage des avantages pour les entreprises |
| Corporations Canada | Corporations Canada |
| Federal corporation search | Recherche de sociétés de régime fédéral |
| Canadian Importers Database | Base de données sur les importateurs canadiens |
| Apply for or amend a trademark | Déposer ou modifier une demande de marque de commerce |
| Search trademarks | Effectuer une recherche sur les marques de commerce |
| Apply for a patent | Déposer une demande de brevet |
| Pay patent maintenance fees | Payez la taxe pour le maintien en état d'un brevet |
| Search patents | Effectuer une recherche sur les brevets |
| Register a copyright | Enregistrer un droit d'auteur |
| Apply for or amend an industrial design | Déposer ou modifier une demande de dessin industriel |
| Amateur radio call signs | Indicatifs d'appel de radioamateur |
| Women Entrepreneurship Loan Fund | Fonds de prêts pour les femmes entrepreneures |
| Women's Enterprise Initiative | Initiative pour les femmes en entreprise |
| Atlantic Canada Opportunities Agency (ACOA) | Agence de promotion économique du Canada atlantique (APECA) |
| Canada Economic Development for Quebec Regions (CED) | Développement économique Canada pour les régions du Québec (DEC) |
| Canadian Northern Economic Development Agency (CanNor) | Agence canadienne de développement économique du Nord (CanNor) |
| Communications Research Centre Canada (CRC) | Centre de recherches sur les communications Canada (CRC) |
| Competition Bureau Canada | Bureau de la concurrence |
| Measurement Canada | Mesures Canada |
| Office of the Superintendent of Bankruptcy | Bureau du surintendant des faillites Canada |
| Health Emergency Readiness Canada (HERC) | Préparation aux crises sanitaires Canada (PCSC) |
