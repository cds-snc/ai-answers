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

export const PROGRAM_SEEDS_BY_DEPARTMENT = {
    'CRA-ARC': [
        'CRA Account',
        'My Account',
        'My Business Account',
        'Represent a Client',
        'Authorize a Representative',
        'Personal tax return',
        'Canada Groceries and Essentials Benefit',
        'Corporate tax return',
        'Canada child benefit',
        'Disability tax credit',
        'First home savings account',
        'Business Number (BN)',
        'GST/HST',
        'Payroll',
        'Employer',
        'Registered retirement savings plan (RRSP)',
        'Registered Education Savings Plan (RESP)',
        'Registered disability savings plan',
        'Tax-free savings account (TFSA)',
        'Underused Housing Tax',
        'Canada Disability Benefit',
        'Voluntary Disclosures',
        'Taxpayer relief provisions',
        'Charities'
    ],
    'EDSC-ESDC': [
        'Canada Disability Benefit',
        'Canadian Dental Care Plan',
        'Canada Education Savings Grant',
        'Canada Pension Plan',
        "CPP children's benefit",
        'CPP disability benefits',
        'CPP death benefit',
        'Canada Student Grants and Canada Student Loans',
        'Social Insurance Number',
        'Employment insurance - regular benefits',
        'Employment insurance - sickness benefits',
        'Employment insurance - maternity and parental benefits',
        'Employment insurance - Caregiving benefits',
        'Employment insurance - Fishing benefits',
        'Employment insurance - Benefits for self-employed',
        'My Service Canada Account',
        'Old Age Security'
    ],
    'TBS-SCT': [
        'Early Retirement Incentive'
    ],
    IRCC: [
        'Adult passport',
        'Child passport',
        'Electronic travel authorization (eTA)',
        'Visitor visa',
        'Study permit',
        'Work permit',
        'Immigrate - general',
        'Immigration - express entry',
        'Immigration - provincial nominee',
        'Refugee protection',
        'Permanent Residency',
        'Citizenship',
        'IRCC account'
    ]
};

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
    { action: 'Get help with', synonyms: ['Delays', 'Locked out account'] },
    { action: 'Recover account', synonyms: ['Forgot password', 'Reset password', 'Locked out'] },
    { action: 'Use MFA', synonyms: ['Multi-factor authentication', 'Verification code', 'Authenticator'] },
    { action: 'Pay', synonyms: ['Remit'] },
    { action: 'Register', synonyms: ['Open', 'Create', 'Set up'] },
    { action: 'Renew', synonyms: [] },
    { action: 'Send', synonyms: ['Submit', 'File'] },
    { action: 'Search', synonyms: ['Find'] },
    { action: 'Sign-in', synonyms: ['Access', 'Log in'] },
    { action: 'Use MFA', synonyms: ['Change multi-factor authentication'] }
];

export const OTHER_LABEL = 'Other';
