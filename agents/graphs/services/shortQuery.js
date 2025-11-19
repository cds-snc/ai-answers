class ShortQueryValidation extends Error {
  constructor(message, userMessage, fallbackUrl) {
    super(message);
    this.name = 'ShortQueryValidation';
    this.userMessage = userMessage;
    this.fallbackUrl = fallbackUrl;
  }
}

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).slice(0, 4).length;
}

function hasAnyLongUserMessage(conversationHistory = []) {
  return conversationHistory.some(m => {
    if (!m || m.error) return false;
    if (m.sender === 'user' && typeof m.text === 'string') {
      return countWords(m.text) > 2;
    }
    return false;
  });
}

function generateFallbackSearchUrl(lang, question, department) {
  const encodedQuestion = encodeURIComponent(question || '');
  const prefix = `https://www.canada.ca/${lang}`;

  const map = {
    isc: {
      en: `${prefix}/indigenous-services-canada/search.html?q=${encodedQuestion}&wb-srch-sub=`,
      fr: `${prefix}/services-autochtones-canada/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`,
    },
    cra: {
      en: `${prefix}/revenue-agency/search.html?q=${encodedQuestion}&wb-srch-sub=`,
      fr: `${prefix}/agence-revenu/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`,
    },
    ircc: {
      en: `${prefix}/services/immigration-citizenship/search.html?q=${encodedQuestion}&wb-srch-sub=`,
      fr: `${prefix}/services/immigration-citoyennete/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`,
    },
  };

  const dept = (department || '').toLowerCase();
  const entry = map[dept];
  const url = entry ? (lang === 'fr' ? entry.fr : entry.en) : `${prefix}/sr/srb.html?q=${encodedQuestion}&wb-srch-sub=`;

  return url;
}

export function validateShortQueryOrThrow(conversationHistory, userMessage, lang, department) {
  const wordCount = countWords(userMessage);
  if (!hasAnyLongUserMessage(conversationHistory) && wordCount <= 2) {
    const fallbackUrl = generateFallbackSearchUrl(lang || 'en', userMessage || '', department);
    throw new ShortQueryValidation('Short query detected', userMessage, fallbackUrl);
  }
}

export { ShortQueryValidation };
