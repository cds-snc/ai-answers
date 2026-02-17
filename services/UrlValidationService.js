import axios from 'axios';
import { Agent } from 'https';
import ServerLoggingService from './ServerLoggingService.js';
import { logGraphEvent } from '../agents/graphs/GraphEventLogger.js';

function getHttpsAgent() {
  return new Agent({ rejectUnauthorized: false });
}

function isKnown404(finalUrl) {
  return finalUrl.includes('404.html');
}

function getFinalUrl(response, url) {
  const final = response?.request?.res?.responseUrl || url;
  // Remove trailing slash for consistency
  return final.endsWith('/') && final.length > 1 ? final.slice(0, -1) : final;
}

function logCheck(url, response, method, chatId) {
  // Fire-and-forget log forwarding; do not await so callers remain sync
  try {
    logGraphEvent('info', `Checked URL: ${url} => ${response.status} (${getFinalUrl(response, url)}) [${method.toUpperCase()}]`, chatId || 'system', {
      url,
      status: response.status,
      finalUrl: getFinalUrl(response, url),
      method: method.toUpperCase(),
    });
  } catch (_e) {
    // swallow to avoid affecting URL checks
  }
}
async function checkUrlWithMethod(url, method = 'head', chatId) {
  const httpsAgent = getHttpsAgent();
  let result = {
    isValid: false,
    status: null,
    finalUrl: url,
    error: null
  };
  try {
    const response = await axios({
      method,
      url,
      httpsAgent,
      maxRedirects: 10,
      timeout: 10000,
      headers: {
        'User-Agent': process.env.USER_AGENT || 'ai-answers',
      },
      validateStatus: () => true,
    });
    result.status = response.status;
    result.finalUrl = getFinalUrl(response, url);
    result.isValid = response.status === 200 && !isKnown404(result.finalUrl);
    logCheck(url, response, method, chatId);
    return result;
  } catch (error) {
    result.status = error.response?.status || 500;
    result.finalUrl = url;
    result.isValid = false;
    result.error = error.message || 'Unknown error';
    logCheck(url, error.response || { status: result.status }, method, chatId);
    return result;
  }
}

export const UrlValidationService = {
  async validateUrl(url, chatId) {
    let headResult = await checkUrlWithMethod(url, 'head', chatId);
    let result = headResult;

    if (!headResult.isValid) {
      let getResult = await checkUrlWithMethod(url, 'get', chatId);
      result = getResult;
    }

    return {
      isValid: result.isValid,
      url: result.finalUrl,
      status: result.status,
      error: result.error || undefined
    };
  },

  // Expose internals for testing if needed
  __private__: { checkUrlWithMethod, isKnown404, getFinalUrl }
};

// --- NEW: Lightweight formatting-only validation (bottom of file for visibility) ---
function isCanadaCaDomain(url) {
  return url.startsWith('https://www.canada.ca') || url.startsWith('http://www.canada.ca');
}

function generateFallbackSearchUrl(lang, question, department, t) {
  const encodedQuestion = encodeURIComponent(question || '');
  let searchUrl;

  switch (department?.toLowerCase()) {
    case 'isc':
      searchUrl =
        lang === 'en'
          ? `https://www.canada.ca/${lang}/indigenous-services-canada/search.html?q=${encodedQuestion}&wb-srch-sub=`
          : `https://www.canada.ca/${lang}/services-autochtones-canada/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`;
      break;
    case 'cra':
      searchUrl =
        lang === 'en'
          ? `https://www.canada.ca/${lang}/revenue-agency/search.html?q=${encodedQuestion}&wb-srch-sub=`
          : `https://www.canada.ca/${lang}/agence-revenu/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`;
      break;
    case 'ircc':
      searchUrl =
        lang === 'en'
          ? `https://www.canada.ca/${lang}/services/immigration-citizenship/search.html?q=${encodedQuestion}&wb-srch-sub=`
          : `https://www.canada.ca/${lang}/services/immigration-citoyennete/rechercher.html?q=${encodedQuestion}&wb-srch-sub=`;
      break;
    default:
      searchUrl = `https://www.canada.ca/${lang || 'en'}/sr/srb.html?q=${encodedQuestion}&wb-srch-sub=`;
  }

  return {
    isValid: false,
    fallbackUrl: searchUrl,
    fallbackText: t ? t('homepage.chat.citation.fallbackText') : undefined,
  };
}

// Expose a formatting-only validator as an additional method so callers can
// opt-in without changing the default live-check behaviour.
UrlValidationService.validateUrlFormatting = async function (url, lang = 'en', question = '', department = undefined, t = null, chatId = null) {
  if (!url) {
    return generateFallbackSearchUrl(lang, question, department, t);
  }

  let checkResult = { isValid: true };

  // NOTE: kept intentionally lightweight and non-networking.
  if ((checkResult.isValid && isCanadaCaDomain(url)) || !isCanadaCaDomain(url)) {
    return {
      isValid: true,
      url: url,
    };
  }

  return generateFallbackSearchUrl(lang, question, department, t);
};
