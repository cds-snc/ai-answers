import { getApiUrl } from './apiToUrl.js';

/**
 * URLToSearch class provides methods to validate and verify URLs for Canada.ca domains
 * Valid canada.ca urls are checked for 404 and if not, returned with high confidence
 * If not a valid canada.ca url, a search url is prepared based on department and returned with low confidence
 */
class URLToSearch {
  /**
   * Validate and check URL accessibility
   * @param {string} url - URL to validate and check
   * @param {string} lang - Language code ('en' or 'fr')
   * @param {string} question - User's question to append to search
   * @param {string} department - Department code (isc, cra, ircc, or undefined)
   * @param {function} t - Translation function
   * @returns {Promise<object>} Validation result with network check
   */
  async validateAndCheckUrl(url, lang, question, department, t, chatId = null) {
    if (!url) {
      return this.generateFallbackSearchUrl(lang, question, department, t);
    }

    const isCanadaCaDomain = (url) => {
      return url.startsWith('https://www.canada.ca') || url.startsWith('http://www.canada.ca');
    };

    // COMMENTED OUT: Pipeline URL validation disabled to avoid double-checking 
    // (AI agent already validates URLs during response generation based on citationInstructions.js)
    // Uncomment if needed for additional validation layer
    
    let checkResult = { isValid: true };
    // if (isCanadaCaDomain(url)) {
    //   try {
    //     const apiUrl = getApiUrl(`util-check-url?url=${encodeURIComponent(url)}${chatId ? `&chatId=${encodeURIComponent(chatId)}` : ''}`);
    //     const response = await fetch(apiUrl);
    //     checkResult = await response.json();
    //   } catch (error) {
    //     checkResult = { isValid: false };
    //   }
    // }

    if ((checkResult.isValid && isCanadaCaDomain(url)) || !isCanadaCaDomain(url)) {
      return {
        isValid: true,
        url: url,
        confidenceRating: checkResult.confidenceRating || '0.5',
      };
    }

    return this.generateFallbackSearchUrl(lang, question, department, t);
  }

  /**
   * Generate a fallback search URL based on department and question
   * @param {string} lang - Language code ('en' or 'fr')
   * @param {string} question - User's question to append to search
   * @param {string} department - Department code (isc, cra, ircc, or undefined)
   * @param {function} t - Translation function
   * @returns {object} Fallback search URL information
   */
  generateFallbackSearchUrl(lang, question, department, t) {
    const encodedQuestion = encodeURIComponent(question);
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
        searchUrl = `https://www.canada.ca/${lang}/sr/srb.html?q=${encodedQuestion}&wb-srch-sub=`;
    }
    return {
      isValid: false,
      fallbackUrl: searchUrl,
      fallbackText: t('homepage.chat.citation.fallbackText'),
      confidenceRating: '0.1',
    };
  }
}

// Export a singleton instance
export const urlToSearch = new URLToSearch();
