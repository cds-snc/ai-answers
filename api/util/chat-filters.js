/**
 * Utility functions to categorize expert feedback and AI evals
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function categorizeExpertFeedback(expertFeedback) {
  if (!expertFeedback) return null;

  const hasCitationError = expertFeedback.citationScore === 0 || expertFeedback.citationScore === 20;
  const totalScore = expertFeedback.totalScore;

  const feedbackFields = [
    { score: expertFeedback.sentence1Score, harmful: expertFeedback.sentence1Harmful },
    { score: expertFeedback.sentence2Score, harmful: expertFeedback.sentence2Harmful },
    { score: expertFeedback.sentence3Score, harmful: expertFeedback.sentence3Harmful },
    { score: expertFeedback.sentence4Score, harmful: expertFeedback.sentence4Harmful }
  ];

  let highestCategory = null;
  let hasAnyScore = false;

  feedbackFields.forEach(({ score, harmful }) => {
    if (score === null || score === undefined) return;
    hasAnyScore = true;
    if (harmful === true) {
      highestCategory = 'harmful';
    } else if (score === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (score === 100 && highestCategory === null) {
      highestCategory = 'correct';
    }
  });

  // Consider totalScore when sentence-level scores are absent
  if (totalScore !== null && totalScore !== undefined) {
    hasAnyScore = true;
    if (totalScore === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (totalScore === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (totalScore === 100 && highestCategory === null) {
      highestCategory = 'correct';
    }
  }

  if (expertFeedback.citationScore !== null && expertFeedback.citationScore !== undefined && !hasCitationError) {
    const citationScore = expertFeedback.citationScore;
    if (citationScore === 20 && highestCategory !== 'hasError' && highestCategory !== 'harmful') {
      highestCategory = 'needsImprovement';
    } else if (citationScore === 25 && highestCategory === null) {
      highestCategory = 'correct';
    }
  }

  if (!hasAnyScore && (expertFeedback.citationScore === null || expertFeedback.citationScore === undefined)) {
    return null;
  }

  if (highestCategory === 'harmful') return 'harmful';
  if (hasCitationError) return 'hasCitationError';
  if (highestCategory === 'hasError') return 'hasError';
  if (highestCategory === 'needsImprovement') return 'needsImprovement';
  return 'correct';
}

export function categorizeAiEval(autoEval) {
  if (!autoEval || !autoEval.expertFeedback) return null;
  return categorizeExpertFeedback(autoEval.expertFeedback);
}

const filterInteractionsByCategory = (chat, category, evaluator) => {
  const interactions = chat.interactions || [];
  const filtered = interactions.filter(interaction => evaluator(interaction) === category);
  if (!filtered.length) return null;
  return { ...chat, interactions: filtered };
};

// Note: filterByPartnerEval and filterByAiEval functions were removed.
// Filtering now happens in the aggregation pipeline using computed fields
// via getPartnerEvalAggregationExpression() and getAiEvalAggregationExpression().

// JS mirror of getPartnerEvalAggregationExpression below — the exact same
// score signals and priority (harmful > hasCitationError > hasError >
// needsImprovement > correct), for consumers that categorize in Node instead
// of in the pipeline (e.g. the partner eval analysis). If the expression
// changes, change this too — they live side by side for that reason.
// (categorizeExpertFeedback above is the older categorizer with different
// edge-case semantics — a scored row without totalScore 100 falls back to
// 'correct' there, but stays null here and in the aggregation.)
export function deriveExpertFeedbackCategory(ef) {
  if (!ef) return null;
  const sentenceScores = [1, 2, 3, 4].map((n) => ef[`sentence${n}Score`]);
  const hasAnyScore =
    sentenceScores.some((s) => [0, 80, 100].includes(s)) ||
    [0, 20, 25].includes(ef.citationScore) ||
    (ef.totalScore !== null && ef.totalScore !== undefined);
  if (!hasAnyScore) return null;

  const hasHarmful = [1, 2, 3, 4].some((n) => ef[`sentence${n}Harmful`] === true);
  if (hasHarmful) return 'harmful';
  if ([0, 20].includes(ef.citationScore)) return 'hasCitationError';
  if (sentenceScores.some((s) => s === 0) || ef.totalScore === 0) return 'hasError';
  if (sentenceScores.some((s) => s === 80) || ef.totalScore === 80) return 'needsImprovement';
  if (ef.totalScore === 100) return 'correct';
  return null;
}

export function getPartnerEvalAggregationExpression(feedbackPath = '$interactions.expertFeedback') {
  return {
    $cond: {
      if: { $eq: [{ $ifNull: [feedbackPath, null] }, null] },
      // Amazon DocumentDB does not support $$REMOVE; return null instead
      then: null,
      else: {
        $let: {
          vars: {
            ef: { $ifNull: [feedbackPath, null] }
          },
          in: {
            $let: {
              vars: {
                hasAnyScore: {
                  $or: [
                    { $in: ['$$ef.sentence1Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence2Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence3Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence4Score', [0, 80, 100]] },
                    { $in: ['$$ef.citationScore', [0, 20, 25]] },
                    { $ne: ['$$ef.totalScore', null] }
                  ]
                },
                hasPerfectTotalScore: { $eq: ['$$ef.totalScore', 100] },
                hasCitationError: { $in: ['$$ef.citationScore', [0, 20]] },
                hasHarmful: {
                  $or: [
                    { $eq: ['$$ef.sentence1Harmful', true] },
                    { $eq: ['$$ef.sentence2Harmful', true] },
                    { $eq: ['$$ef.sentence3Harmful', true] },
                    { $eq: ['$$ef.sentence4Harmful', true] }
                  ]
                },
                hasError: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 0] },
                    { $eq: ['$$ef.sentence2Score', 0] },
                    { $eq: ['$$ef.sentence3Score', 0] },
                    { $eq: ['$$ef.sentence4Score', 0] },
                    { $eq: ['$$ef.totalScore', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.totalScore', 80] }
                  ]
                }
              },
              in: {
                $cond: {
                  if: '$$hasAnyScore',
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$$hasHarmful", true] }, then: 'harmful' },
                        { case: { $eq: ["$$hasCitationError", true] }, then: 'hasCitationError' },
                        { case: { $eq: ["$$hasError", true] }, then: 'hasError' },
                        { case: { $eq: ["$$hasNeedsImprovement", true] }, then: 'needsImprovement' },
                        { case: { $eq: ["$$hasPerfectTotalScore", true] }, then: 'correct' }
                      ],
                      default: null
                    }
                  },
                  // When there is no score data, leave the value as null
                  else: null
                }
              }
            }
          }
        }
      }
    }
  };
}

// Content issue is a separate tag partners/admins can check per-sentence
// during evaluation (sentenceNContentIssue) — independent of the score-
// derived category above (a "correct" answer can still be flagged), so it's
// its own boolean field rather than another category value. Mirrors the
// hasContentIssue expression in metrics-expert-feedback.js. Expert/partner
// only — there's no AI-eval equivalent of this tag.
export function getPartnerContentIssueAggregationExpression(feedbackPath = '$interactions.expertFeedback') {
  return {
    $cond: {
      if: { $eq: [{ $ifNull: [feedbackPath, null] }, null] },
      then: false,
      else: {
        $let: {
          vars: {
            ef: { $ifNull: [feedbackPath, null] }
          },
          in: {
            $or: [
              { $eq: ['$$ef.sentence1ContentIssue', true] },
              { $eq: ['$$ef.sentence2ContentIssue', true] },
              { $eq: ['$$ef.sentence3ContentIssue', true] },
              { $eq: ['$$ef.sentence4ContentIssue', true] }
            ]
          }
        }
      }
    }
  };
}

export function getAiEvalAggregationExpression(feedbackPath = '$interactions.autoEval.expertFeedback') {
  return {
    $let: {
      vars: {
        ef: { $ifNull: [feedbackPath, null] }
      },
      in: {
        $cond: {
          if: { $eq: ['$$ef', null] },
          // DocumentDB does not support $$REMOVE; return null instead
          then: null,
          else: {
            $let: {
              vars: {
                hasAnyScore: {
                  $or: [
                    { $in: ['$$ef.sentence1Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence2Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence3Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence4Score', [0, 80, 100]] },
                    { $in: ['$$ef.citationScore', [0, 20, 25]] },
                    { $ne: ['$$ef.totalScore', null] }
                  ]
                },
                hasPerfectTotalScore: { $eq: ['$$ef.totalScore', 100] },
                hasCitationError: { $in: ['$$ef.citationScore', [0, 20]] },
                hasHarmful: {
                  $or: [
                    { $eq: ['$$ef.sentence1Harmful', true] },
                    { $eq: ['$$ef.sentence2Harmful', true] },
                    { $eq: ['$$ef.sentence3Harmful', true] },
                    { $eq: ['$$ef.sentence4Harmful', true] }
                  ]
                },
                hasError: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 0] },
                    { $eq: ['$$ef.sentence2Score', 0] },
                    { $eq: ['$$ef.sentence3Score', 0] },
                    { $eq: ['$$ef.sentence4Score', 0] },
                    { $eq: ['$$ef.totalScore', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.totalScore', 80] }
                  ]
                }
              },
              in: {
                $cond: {
                  if: '$$hasAnyScore',
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$$hasHarmful", true] }, then: 'harmful' },
                        { case: { $eq: ["$$hasCitationError", true] }, then: 'hasCitationError' },
                        { case: { $eq: ["$$hasError", true] }, then: 'hasError' },
                        { case: { $eq: ["$$hasNeedsImprovement", true] }, then: 'needsImprovement' },
                        { case: { $eq: ["$$hasPerfectTotalScore", true] }, then: 'correct' }
                      ],
                      default: null
                    }
                  },
                  else: null
                }
              }
            }
          }
        }
      }
    }
  };
}

// Subdomains of canada.ca to exclude from the "Public Referred" filter.
// These are CDS-owned, internal, or non-public-facing sites.
// Add both EN and FR variants when applicable.
const EXCLUDED_CANADA_CA_SUBDOMAINS = [
  // CDS sites (EN / FR)
  'blog', 'blogue',
  'digital', 'numerique',
  'design', 'conception',
  // Pre-production / internal
  'alpha',
  'staging',
  'test',
];

// Host labels of the AI Answers app itself. Self-referrals (a user switching
// language within the app, or navigating between answers) are not a public GC
// page and must never count as "Public Referred". Matched by the app's own host
// label rather than the environment subdomain, so the exclusion survives the
// eventual alpha retirement and any domain move (ai-answers.alpha.canada.ca
// today → ai-answers.canada.ca later). The EN and FR apps run on separate hosts.
export const SELF_REFERRAL_LABELS = [
  'ai-answers',   // English
  'reponses-ia',  // French
];

// Build the exclusion regex. Two cases share a leading host boundary (://, ., or
// start-of-string): a CDS/internal subdomain immediately before .canada.ca
// (exact subdomain match only), OR the AI Answers app's own host label in any
// environment (the label must be a full host segment — followed by ., :, /, or
// end — so paths like /en/ai-answers on a real public page are not excluded).
const _excluded = EXCLUDED_CANADA_CA_SUBDOMAINS.map(s => escapeRegex(s)).join('|');
const _selfLabels = SELF_REFERRAL_LABELS.map(s => escapeRegex(s)).join('|');
const REFERRED_PUBLIC_EXCLUSION_REGEX =
  `(://|\\.|^)((${_excluded})\\.canada\\.ca(/|$)|(${_selfLabels})(\\.|:|/|$))`;

// Matches a canada.ca / gc.ca referrer that counts as "referred public" — i.e.
// the question came from a public GC page, excluding CDS/internal subdomains.
// Single source of truth for the same logic the userType filter applies in
// getChatFilterConditions, reused by the blocked-query counter classification.
const REFERRED_PUBLIC_DOMAIN_REGEX = /(:\/\/|\.|^)(canada\.ca|gc\.ca)(\/|$)/i;
const REFERRED_PUBLIC_EXCLUSION_RE = new RegExp(REFERRED_PUBLIC_EXCLUSION_REGEX, 'i');

export function isReferredPublicUrl(referringUrl) {
  if (!referringUrl || typeof referringUrl !== 'string') return false;
  return REFERRED_PUBLIC_DOMAIN_REGEX.test(referringUrl)
    && !REFERRED_PUBLIC_EXCLUSION_RE.test(referringUrl);
}

export function getChatFilterConditions(filters, options = {}) {
  const { basePath = 'interactions', userField = 'user', skipUserCondition = false } = options;
  const prefix = basePath ? `${basePath}.` : '';
  const withPath = (field) => `${prefix}${field}`;
  const conditions = [];

  // userType
  if (!skipUserCondition) {
    if (filters.userType === 'public') {
      conditions.push({ [userField]: { $exists: false } });
    } else if (filters.userType === 'admin') {
      conditions.push({ [userField]: { $exists: true, $ne: null } });
    } else if (filters.userType === 'referredPublic') {
      conditions.push({ [userField]: { $exists: false } });
    }
  }

  if (filters.userType === 'referredPublic') {
    conditions.push({
      [withPath('referringUrl')]: {
        $regex: '(://|\\.|^)(canada\\.ca|gc\\.ca)(/|$)',
        $options: 'i'
      }
    });
    conditions.push({
      [withPath('referringUrl')]: {
        $not: { $regex: REFERRED_PUBLIC_EXCLUSION_REGEX, $options: 'i' }
      }
    });
  }

  // department
  if (filters.department) {
    const escaped = escapeRegex(filters.department);
    conditions.push({ [withPath('department')]: { $regex: escaped, $options: 'i' } });
  }

  // referringUrl
  if (filters.referringUrl) {
    const escaped = escapeRegex(filters.referringUrl);
    conditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }

  // urlEn and urlFr - combine both values using OR, then rely on $and at the top level
  const urlConditions = [];
  if (filters.urlEn) {
    const escaped = escapeRegex(filters.urlEn);
    urlConditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (filters.urlFr) {
    const escaped = escapeRegex(filters.urlFr);
    urlConditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (urlConditions.length === 1) {
    conditions.push(urlConditions[0]);
  } else if (urlConditions.length > 1) {
    conditions.push({ $or: urlConditions });
  }

  // answerType - support multi-select via comma-separated values
  if (filters.answerType && filters.answerType !== 'all') {
    const types = filters.answerType.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      // Single value: exact match (more efficient than $in with one value)
      conditions.push({ [withPath('answerType')]: types[0] });
    } else if (types.length > 1) {
      // Multiple values: use $in operator
      conditions.push({ [withPath('answerType')]: { $in: types } });
    }
  }

  // partnerEval/aiEval - support multi-select via comma-separated values.
  // Builds the same shape as the previous inline blocks; extracted so both
  // fields can be combined via evalLogic below instead of always being
  // pushed as separate (implicitly ANDed) top-level conditions. Each
  // selected pseudo-category (noEval, and — partnerEval only —
  // hasContentIssue) becomes its own OR-branch alongside the real category
  // match, since a row can match on score category and/or either tag
  // independently of the others.
  const buildEvalCondition = (rawValue, field) => {
    if (!rawValue || rawValue === 'all') return null;
    const categories = rawValue.split(',').map(c => c.trim()).filter(Boolean);
    const hasNoEval = categories.includes('noEval');
    const hasContentIssue = field === 'partnerEval' && categories.includes('hasContentIssue');
    const evalCategories = categories.filter(c => c !== 'noEval' && c !== 'hasContentIssue');

    const branches = [];
    if (hasNoEval) {
      branches.push({ $or: [{ [withPath(field)]: null }, { [withPath(field)]: '' }] });
    }
    if (hasContentIssue) {
      branches.push({ [withPath('partnerHasContentIssue')]: true });
    }
    if (evalCategories.length === 1) {
      branches.push({ [withPath(field)]: evalCategories[0] });
    } else if (evalCategories.length > 1) {
      branches.push({ [withPath(field)]: { $in: evalCategories } });
    }

    if (branches.length === 0) return null;
    if (branches.length === 1) return branches[0];
    return { $or: branches };
  };

  const partnerEvalCondition = buildEvalCondition(filters.partnerEval, 'partnerEval');
  const aiEvalCondition = buildEvalCondition(filters.aiEval, 'aiEval');

  // evalLogic only changes anything when BOTH filters are active: 'or' means
  // a row matching either one qualifies, combined into a single condition.
  // Default ('and', or either filter alone) keeps the original behaviour —
  // both pushed as separate conditions, implicitly ANDed by the caller.
  if (partnerEvalCondition && aiEvalCondition && filters.evalLogic === 'or') {
    conditions.push({ $or: [partnerEvalCondition, aiEvalCondition] });
  } else {
    if (partnerEvalCondition) conditions.push(partnerEvalCondition);
    if (aiEvalCondition) conditions.push(aiEvalCondition);
  }

  return conditions;
}
