# CanadaLogin help-page snapshots (TEMPORARY)

These files are copies of public CanadaLogin user help pages from `login.canada.ca`.
They exist only because AI Answers' servers can't read that site yet: every request from
production gets a 404. The model reads these files with `downloadWebPage` instead,
and only when a scenario's ⚠️DOWNLOAD trigger matches.

See `docs/plans/canadalogin-assistant.md` ("Interim: help-page snapshots").

## Rules

- **One file per help page and language**, named after the page's **English** URL slug
  plus `-en` or `-fr`, so the two languages pair up: `create-account-en.md` and
  `create-account-fr.md`. The French URL is in the `-fr` file's header.
- **Each file starts with a header** giving the source URL, the source's modified date
  and the capture date, and telling the model to cite the source URL, never the file.
- **Body text only**, copied word for word, typos included. No navigation, footer or
  menu. Links are rewritten as absolute `login.canada.ca` URLs.
- **Nothing reads these files until a scenario references them.** Scenario references
  point at `main`, so the files are merged before any scenario uses them.

## Keeping them current

The source pages are still changing. When CDS updates a page, recapture it:

1. In Chrome, save each page with **File → Save page as… → "Webpage, HTML only"**, EN
   and FR, into one folder.
2. Run `node scripts/canadalogin-snapshot.js <folder>`. It writes the files here with the
   header and today's capture date. It also lists linked pages that haven't been
   captured yet.
3. A page saved without its other-language version needs its URL:
   `--url "<saved file name>=<page URL>"`. The script stops and tells you if one is
   missing.
4. Update the table below.

## Removing them

When `login.canada.ca` is readable from production:

1. In each scenario, replace each file's raw GitHub URL with the source URL in its header.
2. Delete this folder.
3. Delete the "Interim: help-page snapshots" section of the plan.

## Snapshots

All pages: modified on source 2026-10-22, captured 2026-11-02.

| Page (EN slug) | EN source | FR source |
|---|---|---|
| `create-account` | https://login.canada.ca/en/users/get-started/create-account/ | https://login.canada.ca/fr/utilisateurs/se-lancer-connexioncanada/creer-compte/ |
| `two-step-verification-methods` | https://login.canada.ca/en/users/get-started/two-step-verification-methods/ | https://login.canada.ca/fr/utilisateurs/se-lancer-connexioncanada/verification-deux-etapes/ |
| `updating-signin-method` | https://login.canada.ca/en/users/get-started/updating-signin-method/ | https://login.canada.ca/fr/utilisateurs/se-lancer-connexioncanada/mise-a-jour-methode-connexion/ |
| `managing-multiple-canadalogins` | https://login.canada.ca/en/users/get-started/managing-multiple-canadalogins/ | https://login.canada.ca/fr/utilisateurs/se-lancer-connexioncanada/gerer-plusieurs-identifiants/ |
| `trouble-signing-up` | https://login.canada.ca/en/users/trouble-signing-up/ | https://login.canada.ca/fr/utilisateurs/problemes-inscription/ |
| `issues-enter-verify-email` | https://login.canada.ca/en/users/trouble-signing-up/issues-enter-verify-email/ | https://login.canada.ca/fr/utilisateurs/problemes-inscription/problemes-saisie-verification-adresse-courriel/ |
| `issues-creating-password` | https://login.canada.ca/en/users/trouble-signing-up/issues-creating-password/ | **missing** – https://login.canada.ca/fr/utilisateurs/problemes-inscription/problemes-creation-mot-de-passe/ |

### Not captured yet

Linked from the pages above and needed for the registration journey:

| EN source | FR source |
|---|---|
| https://login.canada.ca/en/users/trouble-signing-up/issues-2-step-verification/ | https://login.canada.ca/fr/utilisateurs/problemes-inscription/problemes-configuration-verification-deux-etapes/ |
| https://login.canada.ca/en/users/trouble-signing-up/issues-creating-profile/ | https://login.canada.ca/fr/utilisateurs/problemes-inscription/problemes-creation-profil/ |
| https://login.canada.ca/en/users/trouble-signing-up/supported-countries/ | https://login.canada.ca/fr/utilisateurs/problemes-inscription/numeros-internationaux-pris-en-charge/ |
| https://login.canada.ca/en/users/get-started/replacing-existing-signin-methods/ | https://login.canada.ca/fr/utilisateurs/se-lancer-connexioncanada/remplacer-methodes-de-connexion-existantes/ |
| https://login.canada.ca/en/users/contact-us/ | https://login.canada.ca/fr/utilisateurs/nous-contacter/ |
