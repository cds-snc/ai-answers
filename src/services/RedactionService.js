/**
 * RedactionService.js
 * A service for redacting sensitive information from text content.
 *
 * Redaction Types:
 * - Private Information (replaced with 'XXX')
 * - Profanity (replaced with '#' characters)
 * - Threats (replaced with '#' characters)
 * - Manipulation attempts (replaced with '#' characters)
 */

import profanityListEn from './redactions/badwords_en.txt';
import profanityListFr from './redactions/badwords_fr.txt';
import manipulationEn from './redactions/manipulation_en.json';
import manipulationFr from './redactions/manipulation_fr.json';
import threatsListEn from './redactions/threats_en.txt';
import threatsListFr from './redactions/threats_fr.txt';

class RedactionService {
  constructor() {
    this.profanityPattern = null;
    this.manipulationPattern = null;
    this.threatPattern = null;
    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Check if the service is ready to use
   * @returns {boolean} Whether the service is initialized
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Initialize the redaction patterns
   */
  async initialize() {
    try {
      await this.initializeProfanityPattern();
      await this.initializeThreatPattern();
      this.initializeManipulationPattern();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RedactionService:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Load and process profanity lists from both English and French sources
   * @returns {Promise<string[]>} Array of cleaned profanity words
   */
  async loadProfanityLists() {
    try {
      const [responseEn, responseFr] = await Promise.all([
        fetch(profanityListEn),
        fetch(profanityListFr),
      ]);

      const [textEn, textFr] = await Promise.all([responseEn.text(), responseFr.text()]);

      const cleanFrenchWords = this.cleanWordList(textFr);
      const cleanEnglishWords = this.cleanWordList(textEn);

      const combinedWords = [...cleanEnglishWords, ...cleanFrenchWords];
      console.log('Loaded profanity words:', combinedWords.length, 'words');

      return combinedWords;
    } catch (error) {
      console.error('Error loading profanity lists:', error);
      return [];
    }
  }

  /**
   * Load and process threat lists from both English and French sources
   * @returns {Promise<string[]>} Array of cleaned threat words
   */
  async loadThreatLists() {
    try {
      const [responseEn, responseFr] = await Promise.all([
        fetch(threatsListEn),
        fetch(threatsListFr),
      ]);

      const [textEn, textFr] = await Promise.all([responseEn.text(), responseFr.text()]);

      const cleanEnglishWords = this.cleanWordList(textEn);
      const cleanFrenchWords = this.cleanWordList(textFr);

      const combinedWords = [...cleanEnglishWords, ...cleanFrenchWords];
      console.log('Loaded threat words:', combinedWords.length, 'words');

      return combinedWords;
    } catch (error) {
      console.error('Error loading threat lists:', error);
      return [];
    }
  }

  /**
   * Clean and process a word list
   * @param {string} text Raw word list
   * @returns {string[]} Cleaned words
   */
  cleanWordList(text) {
    return text
      .split('\n')
      .map((word) =>
        word
          .replace(/[!@,]/g, '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
      )
      .filter((word) => word.length > 0);
  }

  /**
   * Initialize the profanity pattern
   */
  async initializeProfanityPattern() {
    const words = await this.loadProfanityLists();
    const pattern = words.map((word) => `\\b${word}\\b`).join('|');
    this.profanityPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the threat pattern
   */
  async initializeThreatPattern() {
    const words = await this.loadThreatLists();
    const pattern = words.map((word) => `\\b${word}\\b`).join('|');
    this.threatPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the manipulation pattern
   */
  initializeManipulationPattern() {
    const manipulationWords = [
      ...manipulationEn.suspiciousWords,
      ...manipulationEn.manipulationPhrases,
      ...manipulationFr.suspiciousWords,
      ...manipulationFr.manipulationPhrases,
    ];

    const pattern = manipulationWords
      .map((word) => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${escaped}\\b`;
      })
      .join('|');

    this.manipulationPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Get the list of private information patterns
   * @returns {RegExp[]} Array of regular expressions for private information
   */
  get privatePatterns() {
    return [
      {
        pattern:
          /((\+\d{1,2}\s?)?1?[-.]?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?)/g,
        description: 'Phone numbers (including international formats and extensions)',
      },
      {
        pattern: /[A-Za-z]\s*\d\s*[A-Za-z]\s*[ -]?\s*\d\s*[A-Za-z]\s*\d/g,
        description: 'Canadian postal codes (with flexible spacing)',
      },
      {
        pattern: /([a-zA-Z0-9_\-.]+)\s*@([\sa-zA-Z0-9_\-.]+)[.,]([a-zA-Z]{1,5})/g,
        description: 'Email addresses (with flexible spacing and punctuation)',
      },
      {
        pattern: /\b([A-Za-z]{2}\s*\d{6})\b/g,
        description: 'Passport Numbers',
      },
      {
        pattern: /\b(?<!\$)(?!\d+\b)[0-9][A-Z0-9\s\-.]{3,}[0-9]\b/gi,
        description:
          'Sequences starting and ending with digits that contain non-numeric characters (catches various ID numbers, SSN, SIN, credit cards, etc., but excludes pure number sequences)',
      },
      {
        pattern: /(?<=\b(name\s+is|nom\s+est|name:|nom:)\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi,
        description: 'Name patterns in EN/FR',
      },
      {
        pattern:
          /\d+\s+([A-Za-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|circle|cir|Loop)\b/gi,
        description: 'Street addresses',
      },
      {
        pattern: /\b\d{5}(?:-\d{4})?\b/g,
        description: 'US ZIP codes',
      },
      {
        pattern: /\b(apt|bldg|dept|fl|hngr|lot|pier|rm|ste|slip|trlr|unit|#)\.? *\d+[a-z]?\b/gi,
        description: 'Apartment addresses',
      },
      {
        pattern: /P\.? ?O\.? *Box +\d+/gi,
        description: 'PO Box',
      },
      {
        pattern: /(\d{1,3}(\.\d{1,3}){3}|[0-9A-F]{4}(:[0-9A-F]{4}){5}(::|(:0000)+))/gi,
        description: 'IP addresses',
      },
      {
        pattern: /([^\s:/?#]+):\/\/([^/?#\s]*)([^?#\s]*)(\?([^#\s]*))?(#([^\s]*))?/g,
        description: 'URLs',
      },
      {
        pattern: /(?<!\$)(?!\d{4}\b)\b\d{5,}\b/g,
        description: 'Long number sequences',
      },
    ].map(({ pattern }) => pattern);
  }

  /**
   * Get all redaction patterns
   * @returns {Array<{pattern: RegExp, type: string}>} Array of pattern objects
   */
  get redactionPatterns() {
    return [
      ...this.privatePatterns.map((pattern) => ({ pattern, type: 'private' })),
      {
        pattern: this.profanityPattern,
        type: 'profanity',
      },
      {
        pattern: this.threatPattern,
        type: 'threat',
      },
      {
        pattern: this.manipulationPattern,
        type: 'manipulation',
      },
    ];
  }

  /**
   * Redact sensitive information from text
   * @param {string} text Text to redact
   * @returns {{redactedText: string, redactedItems: Array<{value: string, type: string}>}}
   * @throws {Error} If service is not initialized
   */
  redactText(text) {
    if (!this.isReady()) {
      throw new Error('RedactionService is not initialized');
    }

    if (!text) return { redactedText: '', redactedItems: [] };

    let redactedText = text;
    const redactedItems = [];

    // Filter out patterns with null RegExp (in case initialization failed)
    const validPatterns = this.redactionPatterns.filter(({ pattern }) => pattern !== null);

    validPatterns.forEach(({ pattern, type }, index) => {
      // Skip processing if this pattern type has already been redacted
      if (
        (type === 'profanity' || type === 'threat' || type === 'manipulation') &&
        redactedText.includes('XXX')
      ) {
        return;
      }

      redactedText = redactedText.replace(pattern, (match) => {
        console.log(`Pattern ${index} matched: "${match}"`);
        redactedItems.push({ value: match, type });
        return type === 'private' ? 'XXX' : '#'.repeat(match.length);
      });
    });

    return { redactedText, redactedItems };
  }
}

// Create and export a singleton instance
const redactionService = new RedactionService();
export default redactionService;
