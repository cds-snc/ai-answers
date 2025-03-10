/**
 * RedactionService.js
 * A service for redacting sensitive information from text content.
 *
 * Redaction Types:
 * - Private Information (including names, replaced with 'XXX')
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
import nlp from 'compromise';
import LoggingService from './ClientLoggingService.js';

class RedactionService {
  constructor() {
    this.profanityPattern = null;
    this.manipulationPattern = null;
    this.threatPattern = null;
    this.namePattern = null;
    this.isInitialized = false;
    this.enableNameDetection = false; // Temporarily disabled name detection
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
   * Enable or disable name detection
   * @param {boolean} enable Whether to enable name detection
   */
  setNameDetection(enable) {
    this.enableNameDetection = enable;
    console.log(`Name detection ${enable ? 'enabled' : 'disabled'}`);
  }

  /**
   * Initialize the redaction patterns
   */
  async initialize() {
    try {
      await this.initializeProfanityPattern();
      await this.initializeThreatPattern();
      this.initializeManipulationPattern();
      this.initializeNamePattern();
      this.isInitialized = true;
    } catch (error) {
      await LoggingService.error("system", 'Failed to initialize RedactionService:', error);
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
        fetch(profanityListFr)
      ]);

      const [textEn, textFr] = await Promise.all([
        responseEn.text(),
        responseFr.text()
      ]);

      const cleanFrenchWords = this.cleanWordList(textFr);
      const cleanEnglishWords = this.cleanWordList(textEn);

      const combinedWords = [...cleanEnglishWords, ...cleanFrenchWords];
      await LoggingService.info("system", `Loaded profanity words: ${combinedWords.length} words`);

      return combinedWords;
    } catch (error) {
      await LoggingService.error("system", 'Error loading profanity lists:', error);
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
        fetch(threatsListFr)
      ]);

      const [textEn, textFr] = await Promise.all([
        responseEn.text(),
        responseFr.text()
      ]);

      const cleanEnglishWords = this.cleanWordList(textEn);
      const cleanFrenchWords = this.cleanWordList(textFr);

      const combinedWords = [...cleanEnglishWords, ...cleanFrenchWords];
      await LoggingService.info("system", `Loaded threat words: ${combinedWords.length} words`);

      return combinedWords;
    } catch (error) {
      await LoggingService.error("system", 'Error loading threat lists:', error);
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
      .map(word => word
        .replace(/[!@,]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
      )
      .filter(word => word.length > 0);
  }

  /**
   * Initialize the profanity pattern
   */
  async initializeProfanityPattern() {
    const words = await this.loadProfanityLists();
    const pattern = words.map(word => `\\b${word}\\b`).join('|');
    this.profanityPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the threat pattern
   */
  async initializeThreatPattern() {
    const words = await this.loadThreatLists();
    const pattern = words.map(word => `\\b${word}\\b`).join('|');
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
      ...manipulationFr.manipulationPhrases
    ];

    const pattern = manipulationWords
      .map(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${escaped}\\b`;
      })
      .join('|');

    this.manipulationPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the name detection pattern
   * This creates a regex-based fallback for when NLP processing isn't sufficient
   */
  initializeNamePattern() {
    // Common name prefixes that often precede names
    const namePrefixes = [
      'Mr\\.?', 'Mrs\\.?', 'Ms\\.?', 'Miss', 'Dr\\.?', 'Prof\\.?', 'Sir', 'Madam', 'Lady',
      'Monsieur', 'Madame', 'Mademoiselle', 'Docteur', 'Professeur'
    ];

    // Create a pattern that matches names after prefixes
    // This is a fallback for the NLP-based name detection
    const prefixPattern = namePrefixes.join('|');
    this.namePattern = new RegExp(`\\b(${prefixPattern})\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\b`, 'g');
  }

  /**
   * Detect names in text using NLP and pattern matching
   * @param {string} text Text to analyze for names
   * @returns {Array<{start: number, end: number, text: string}>} Array of name matches with positions
   */
  detectNames(text) {
    if (!text) return [];

    const nameMatches = [];

    // Use compromise NLP to find person names
    const doc = nlp(text);
    const people = doc.people().out('array');

    // Find all person entities in the text
    people.forEach(person => {
      // Find all occurrences of this person's name in the text
      let startIndex = 0;
      while (startIndex < text.length) {
        const index = text.indexOf(person, startIndex);
        if (index === -1) break;

        nameMatches.push({
          start: index,
          end: index + person.length,
          text: person
        });

        startIndex = index + 1;
      }
    });

    // Use regex fallback for names with prefixes
    let match;
    while ((match = this.namePattern.exec(text)) !== null) {
      const fullMatch = match[0];

      nameMatches.push({
        start: match.index,
        end: match.index + fullMatch.length,
        text: fullMatch
      });
    }

    // Sort matches by start position and remove overlaps
    return this.removeOverlappingMatches(nameMatches);
  }

  /**
   * Remove overlapping matches, keeping the longer ones
   * @param {Array<{start: number, end: number, text: string}>} matches Array of matches
   * @returns {Array<{start: number, end: number, text: string}>} Filtered matches
   */
  removeOverlappingMatches(matches) {
    if (matches.length <= 1) return matches;

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    const result = [matches[0]];

    for (let i = 1; i < matches.length; i++) {
      const current = matches[i];
      const previous = result[result.length - 1];

      // Check if current overlaps with previous
      if (current.start < previous.end) {
        // If current is longer, replace previous
        if (current.end - current.start > previous.end - previous.start) {
          result[result.length - 1] = current;
        }
        // Otherwise keep previous (do nothing)
      } else {
        // No overlap, add current
        result.push(current);
      }
    }

    return result;
  }

  /**
   * Get the list of private information patterns
   * @returns {RegExp[]} Array of regular expressions for private information
   */
  get privatePatterns() {
    return [
      {
        pattern: /((\+\d{1,2}\s?)?1?[-.]?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?)/g,
        description: 'Phone numbers (including international formats and extensions)'
      },
      {
        pattern: /[A-Za-z]\s*\d\s*[A-Za-z]\s*[ -]?\s*\d\s*[A-Za-z]\s*\d/g,
        description: 'Canadian postal codes (with flexible spacing)'
      },
      {
        pattern: /([a-zA-Z0-9_\-.]+)\s*@([\sa-zA-Z0-9_\-.]+)[.,]([a-zA-Z]{1,5})/g,
        description: 'Email addresses (with flexible spacing and punctuation)'
      },
      {
        pattern: /\b([A-Za-z]{2}\s*\d{6})\b/g,
        description: 'Passport Numbers'
      },
      {
        pattern: /\b(?<!\$)(?=[A-Z0-9-]*[0-9])(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b/gi,
        description: 'Alphanumeric sequences of 5+ chars that contain both letters and numbers (catches various ID numbers, passport numbers, account codes, etc., but excludes pure text or numbers)'
      },
      {
        pattern: /(?<=\b(name\s+is|nom\s+est|name:|nom:)\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi,
        description: 'Name patterns in EN/FR'
      },
      {
        pattern: /\d+\s+([A-Za-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|circle|cir|Loop)\b/gi,
        description: 'Street addresses'
      },
      {
        pattern: /\b\d{5}(?:-\d{4})?\b/g,
        description: 'US ZIP codes'
      },
      {
        pattern: /\b(apt|bldg|dept|fl|hngr|lot|pier|rm|ste|slip|trlr|unit|#)\.? *\d+[a-z]?\b/gi,
        description: 'Apartment addresses'
      },
      {
        pattern: /P\.? ?O\.? *Box +\d+/gi,
        description: 'PO Box'
      },
      {
        pattern: /(\d{1,3}(\.\d{1,3}){3}|[0-9A-F]{4}(:[0-9A-F]{4}){5}(::|(:0000)+))/gi,
        description: 'IP addresses'
      },
      {
        pattern: /([^\s:/?#]+):\/\/([^/?#\s]*)([^?#\s]*)(\?([^#\s]*))?(#([^\s]*))?/g,
        description: 'URLs'
      },
      {
        pattern: /(?<!\$)(?!\d{4}\b)\b\d{5,}\b/g,
        description: 'Long number sequences'
      },
      {
        pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
        description: 'Canadian SIN (Social Insurance Number)'
      },
      {
        // Common name prefixes pattern
        pattern: /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Madam|Lady|Monsieur|Madame|Mademoiselle|Docteur|Professeur)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
        description: 'Names with prefixes'
      },
      {
        // Names in "My name is..." format
        pattern: /\b(?:my name is|je m'appelle|je me nomme|my name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
        description: 'Names in introduction phrases'
      },
      // {
        // Capitalized names (2-3 words)
        // pattern: /\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2})\b(?!\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|Circle|Cir|Loop))\b/g,
        // description: 'Capitalized names (2-3 words, not followed by street type)'
      // },
      // {
      //   // Names in greeting patterns
      //   pattern: /\b(?:Dear|Hello|Hi|Bonjour|Cher|Chère|Salut)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
      //   description: 'Names in greeting patterns'
      // },
      {
        // // Names in signature patterns
        // pattern: /\b(?:Sincerely|Regards|Best|Cheers|Cordialement|Sincèrement|Amicalement)\s*,\s*\n*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
        // description: 'Names in signature patterns'
      }
    ].map(({ pattern }) => pattern);
  }

  /**
   * Get all redaction patterns
   * @returns {Array<{pattern: RegExp, type: string}>} Array of pattern objects
   */
  get redactionPatterns() {
    return [
      ...this.privatePatterns.map(pattern => ({ pattern, type: 'private' })),
      {
        pattern: this.profanityPattern,
        type: 'profanity'
      },
      {
        pattern: this.threatPattern,
        type: 'threat'
      },
      {
        pattern: this.manipulationPattern,
        type: 'manipulation'
      }
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

    // Only perform name detection if enabled
    if (this.enableNameDetection) {
      // First, detect names using NLP
      const nameMatches = this.detectNames(text);
      
      // Sort name matches in reverse order (to avoid index shifting when replacing)
      const sortedNameMatches = [...nameMatches].sort((a, b) => b.start - a.start);
      
      // Replace names with XXX (treating them as private information)
      let redactedForNames = text;
      sortedNameMatches.forEach(match => {
        const replacement = 'XXX';
        redactedForNames =
          redactedForNames.substring(0, match.start) +
          replacement +
          redactedForNames.substring(match.end);
        
        redactedItems.push({ value: match.text, type: 'private' });
        console.log(`Name detected and redacted: "${match.text}"`);
      });
      
      // Update redactedText with the name-redacted version
      redactedText = redactedForNames;
    }

    // Filter out patterns with null RegExp (in case initialization failed)
    const validPatterns = this.redactionPatterns.filter(({ pattern }) => pattern !== null);

    validPatterns.forEach(({ pattern, type }, index) => {
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

// Add a method to ensure the service is initialized before use
redactionService.ensureInitialized = async function() {
  if (!this.isInitialized) {
    console.log('RedactionService not initialized, initializing now...');
    await this.initialize();
  }
  return this.isInitialized;
};

export default redactionService;