// Seed vocabulary for the partner eval-analysis topic classification.
// Converted from "LF services actions ideas.csv" (Lisa Fast, 2026-07).
//
// These are NOT a closed taxonomy: the classifier derives emergent topic
// groups from the questions/answers themselves and uses this vocabulary only
// as examples of the granularity wanted. Services are grouped by department
// abbrKey (see agents/prompts/scenarios/departments_EN.js — never invent new
// abbrKeys); the action list is global across departments.

export const SERVICE_SEEDS_BY_DEPARTMENT = {
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
        'GST/HST credit',
        'Business Number (BN)',
        'GST/HST account (RT)',
        'Payroll deductions account (RP)',
        'Registered retirement savings plan (RRSP)',
        'Registered Education Savings Plan (RESP)',
        'Registered disability savings plan',
        'Tax-free savings account (TFSA)',
        'Underused Housing Tax',
        'Canada Disability Benefit'
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
        'Immigration through express entry',
        'Immigration as a provincial nominee',
        'Refugee protection',
        'IRCC account'
    ]
};

// Global action vocabulary: what the user is trying to DO with a service.
// `synonyms` help the classifier recognize phrasing variants.
export const ACTION_SEEDS = [
    { action: 'Apply', synonyms: ['Request'] },
    { action: 'Change my contact information', synonyms: ['Update', 'Modify', 'Fix', 'Address', 'Phone number'] },
    { action: 'Change my banking information', synonyms: ['Direct deposit'] },
    { action: 'Check status', synonyms: [] },
    { action: 'Check eligibility', synonyms: [] },
    { action: 'Check processing times', synonyms: ['Service standards'] },
    { action: 'Claim', synonyms: ['Request'] },
    { action: 'Complain', synonyms: [] },
    { action: 'Contact', synonyms: ['Email', 'Phone', 'Mailing address', 'Fax number', 'Office locations'] },
    { action: 'Find out how much money I can receive', synonyms: [] },
    { action: 'Find benefit payment date', synonyms: [] },
    { action: 'Find out payment due date', synonyms: [] },
    { action: 'Find out how much I owe', synonyms: ['Balance owing', 'Fee', 'Fine'] },
    { action: 'Find options available', synonyms: ['Innovation', 'Immigration', 'Jobs'] },
    { action: 'Get help with', synonyms: ['Delays', 'Locked out account'] },
    { action: 'Recover account', synonyms: ['Forgot password', 'Reset password', 'Locked out'] },
    { action: 'Use MFA', synonyms: ['Multi-factor authentication', 'Verification code', 'Authenticator'] },
    { action: 'Pay', synonyms: ['Remit'] },
    { action: 'Register', synonyms: ['Open', 'Create', 'Set up'] },
    { action: 'Renew', synonyms: [] },
    { action: 'Send', synonyms: ['Submit', 'File'] },
    { action: 'Search', synonyms: ['Find'] },
    { action: 'Sign-in', synonyms: ['Access', 'Log in'] }
];

export const OTHER_LABEL = 'Other';
