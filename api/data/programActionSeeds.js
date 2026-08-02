// Seed vocabulary for the program/action classification (per-question tagging
// and the partner eval analysis). Converted from Lisa Fast's seed CSV
// (seed-programs-actions-ideas.csv, formerly "LF services actions ideas.csv",
// 2026-07) — most entries in that CSV were in fact programs, hence the
// program framing here.
//
// These are NOT a closed taxonomy: the classifier derives emergent topic
// groups from the questions/answers themselves and uses this vocabulary only
// as examples of the granularity wanted. Programs are grouped by department
// abbrKey (see agents/prompts/scenarios/departments_EN.js — never invent new
// abbrKeys); the action list is global across departments.
//
// PER-DEPARTMENT MARKDOWN IS NOW THE SOURCE OF TRUTH: each department's programs
// live in a curated, partner-editable EN/FR list at
//   agents/prompts/scenarios/context-<dept-dashed>/<dept-dashed>-services.md
// loaded via programSeedsLoader.js (getSeedPrograms). Every department that had
// harvested programs has migrated to its .md, so this map is now empty; it is
// kept only as the loader's fallback for any department that has neither a .md
// file nor yet-harvested programs (the loader returns [] in that case).

export const PROGRAM_SEEDS_BY_DEPARTMENT = {};

// Global action vocabulary: what the user is trying to DO with a program.
// `synonyms` help the classifier recognize phrasing variants.
export const ACTION_SEEDS = [
    { action: 'Apply', synonyms: ['Request'] },
    { action: 'Change contact details', synonyms: ['Update', 'Modify', 'Fix', 'Address', 'Phone number'] },
    { action: 'Change direct deposit', synonyms: ['Direct deposit','Banking information'] },
    { action: 'Check status', synonyms: [] },
    { action: 'Check eligibility', synonyms: [] },
    { action: 'Check processing times', synonyms: ['Service standards'] },
    { action: 'Claim', synonyms: ['Request'] },
    { action: 'Complain', synonyms: [] },
    { action: 'Contact', synonyms: ['Email', 'Phone', 'Mailing address', 'Fax number', 'Office locations'] },
    { action: 'How much can I receive', synonyms: [] },
    { action: 'Find benefit payment date', synonyms: [] },
    { action: 'Find out payment due date', synonyms: [] },
    { action: 'How much I owe', synonyms: ['Balance owing', 'Fee', 'Fine'] },
    { action: 'Find options available', synonyms: ['Innovation', 'Immigration', 'Jobs'] },
    { action: 'Get info', synonyms: ['What is', 'When', 'How does it work', 'Explain', 'Learn about'] },
    { action: 'Get help with', synonyms: ['Delays', 'Locked out account'] },
    { action: 'Recover account', synonyms: ['Forgot password', 'Reset password', 'Locked out'] },
    { action: 'Use MFA', synonyms: ['Multi-factor authentication', 'Verification code', 'Authenticator', 'Change multi-factor authentication'] },
    { action: 'Pay', synonyms: ['Remit'] },
    { action: 'Register', synonyms: ['Open', 'Create', 'Set up'] },
    { action: 'Renew', synonyms: [] },
    { action: 'Send', synonyms: ['Submit', 'File'] },
    { action: 'Search', synonyms: ['Find'] },
    { action: 'Sign-in', synonyms: ['Access', 'Log in'] }
];

// French display labels for the action vocabulary, keyed by the canonical English
// action (the value stored in Context.action). Display-only: actions are always
// classified and stored in English; French admins/partners see these at render
// time, English is the fallback for anything unmapped. Kept as a separate map so
// ACTION_SEEDS stays English-only when passed to the classifier prompt. Every
// ACTION_SEEDS action must have an entry here.
export const ACTION_FR = {
    'Apply': 'Présenter une demande',
    'Change contact details': 'Modifier les coordonnées',
    'Change direct deposit': 'Modifier le dépôt direct',
    'Check status': "Vérifier l'état",
    'Check eligibility': "Vérifier l'admissibilité",
    'Check processing times': 'Vérifier les délais de traitement',
    'Claim': 'Faire une réclamation',
    'Complain': 'Porter plainte',
    'Contact': 'Communiquer',
    'How much can I receive': 'Combien puis-je recevoir',
    'Find benefit payment date': 'Trouver la date de paiement de la prestation',
    'Find out payment due date': "Trouver la date d'échéance du paiement",
    'How much I owe': 'Combien je dois',
    'Find options available': 'Trouver les options offertes',
    'Get info': "Obtenir de l'information",
    'Get help with': "Obtenir de l'aide",
    'Recover account': "Récupérer l'accès au compte",
    'Use MFA': "Utiliser l'authentification multifacteur",
    'Pay': 'Payer',
    'Register': "S'inscrire",
    'Renew': 'Renouveler',
    'Send': 'Envoyer',
    'Search': 'Rechercher',
    'Sign-in': 'Se connecter'
};

export const OTHER_LABEL = 'Other';
