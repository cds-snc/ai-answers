/**
 * RedactionService.js
 * A service for redacting sensitive information from text content.
 * Important: This service uses the words lists associated with the language passed in - which is the PAGE language, not the language of the user's question. 
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
    this.currentLang = null;
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
   * Initialize patterns for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   */
  async initialize(lang = 'en') {
    try {
      this.currentLang = lang;
      await this.initializeProfanityPattern(lang);
      await this.initializeThreatPattern(lang);
      this.initializeManipulationPattern(lang);
      this.initializeNamePattern();
      this.isInitialized = true;
    } catch (error) {
      await LoggingService.error("system", 'Failed to initialize RedactionService:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Load and process profanity lists for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   * @returns {Promise<string[]>} Array of cleaned profanity words
   */
  async loadProfanityLists(lang) {
    try {
      const response = await fetch(lang === 'fr' ? profanityListFr : profanityListEn);
      const text = await response.text();
      const words = this.cleanWordList(text);
      await LoggingService.info("system", `Loaded profanity words for ${lang}: ${words.length} words`);
      return words;
    } catch (error) {
      await LoggingService.error("system", `Error loading profanity list for ${lang}:`, error);
      return [];
    }
  }

  /**
   * Load and process threat lists for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   * @returns {Promise<string[]>} Array of cleaned threat words
   */
  async loadThreatLists(lang) {
    try {
      const response = await fetch(lang === 'fr' ? threatsListFr : threatsListEn);
      const text = await response.text();
      const words = this.cleanWordList(text);
      await LoggingService.info("system", `Loaded threat words for ${lang}: ${words.length} words`);
      return words;
    } catch (error) {
      await LoggingService.error("system", `Error loading threat list for ${lang}:`, error);
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
   * Initialize the profanity pattern for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   */
  async initializeProfanityPattern(lang) {
    const words = await this.loadProfanityLists(lang);
    const pattern = words.map(word => `\\b${word}\\b`).join('|');
    this.profanityPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the threat pattern for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   */
  async initializeThreatPattern(lang) {
    const words = await this.loadThreatLists(lang);
    const pattern = words.map(word => `\\b${word}\\b`).join('|');
    this.threatPattern = new RegExp(`(${pattern})`, 'gi');
  }

  /**
   * Initialize the manipulation pattern for the specified language
   * @param {string} lang Language code ('en' or 'fr')
   */
  initializeManipulationPattern(lang) {
    const manipulationWords = lang === 'fr' 
      ? [...manipulationFr.suspiciousWords, ...manipulationFr.manipulationPhrases]
      : [...manipulationEn.suspiciousWords, ...manipulationEn.manipulationPhrases];

    // Create pattern for manipulation words
    const wordPattern = manipulationWords
      .map(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${escaped}\\b`;
      })
      .join('|');

    // Add URL pattern to manipulation patterns
    const urlPattern = /([^\s:/?#]+):\/\/([^/?#\s]*)([^?#\s]*)(\?([^#\s]*))?(#([^\s]*))?/g;
    
    // Combine word patterns with URL pattern
    this.manipulationPattern = new RegExp(`(${wordPattern}|${urlPattern.source})`, 'gi');
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
      // {
      //   pattern: /\b(?=[A-Z0-9-]*[0-9])(?=[A-Z0-9-]*[A-Z])(?!(?:GST\d{3}|RC\d{3}\b|RC\d+[A-Z-]*)\b)[A-Z0-9-]{6,}\b/gi,
      //   description: 'Alphanumeric sequences of 6+ chars that contain both letters and numbers (excluding CRA GST and RC forms)'REMOVED because it was catching too many FORM numbers that are entered in a variety of ways eg IMM1294f or imm 1294f or PPTC326 and pptc 326 etc. 
      // },
      {
        pattern: /\b(?<!\$)\d{6,}\b/g,
        description: 'Long number sequences like credit card numbers with negative lookbehind to exclude dollar amounts'
      },
      {
        pattern: /\d+\s+([A-Za-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|circle|cir|Loop)\b/gi,
        description: 'Street addresses'
      },
      // {
      //   pattern: /\b(?<!\$)\d{5}(?:-\d{4})?\b/g,
      //   description: 'US ZIP codes of 5 digits (excluding dollar amounts)' REMOVED - WAS CATCHING TOO MANY CRA LINE NUMBERS AND FORM NUMBERS
      // },
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
      // {
      //   pattern: /([^\s:/?#]+):\/\/([^/?#\s]*)([^?#\s]*)(\?([^#\s]*))?(#([^\s]*))?/g,
      //   description: 'URLs'
      // },
      {
        pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
        description: 'Canadian SIN (Social Insurance Number)'
      },
      // NAME DETECTION PATTERNS - Grouped together for easier maintenance
      {
        // Names in "My name is..." format
        pattern: /\b(?:my name is|je m'appelle|je me nomme|my name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
        description: 'Names in introduction phrases'
      },
      {
        // Names with prefixes (Mr., Mrs., Dr., etc.)
        pattern: /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Madam|Lady|Monsieur|Madame|Mademoiselle|Docteur|Professeur)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
        description: 'Names with prefixes'
      },
      {
        // Names in "name:" or "nom:" format
        pattern: /(?<=\b(name:|nom:)\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi,
        description: 'Name patterns in EN/FR'
      },
      // REMOVED: Names in "name [Name]" format pattern - was too broad and caught legitimate questions about name changes
      // {
      //   pattern: /\b(?:name|nom)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
      //   description: 'Names in incomplete introduction phrases'
      // },
      {
        // Names in signature patterns
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
    // Comprehensive emoji regex that covers most emoji ranges including praying hands and other symbols
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F650}-\u{1F67F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{1F9B4}-\u{1F9B5}]|[\u{1F9B6}-\u{1F9B7}]|[\u{1F9B8}-\u{1F9B9}]|[\u{1F9BA}-\u{1F9BB}]|[\u{1F9BC}-\u{1F9BD}]|[\u{1F9BE}-\u{1F9BF}]|[\u{1F9C0}-\u{1F9C1}]|[\u{1F9C2}-\u{1F9C3}]|[\u{1F9C4}-\u{1F9C5}]|[\u{1F9C6}-\u{1F9C7}]|[\u{1F9C8}-\u{1F9C9}]|[\u{1F9CA}-\u{1F9CB}]|[\u{1F9CC}-\u{1F9CD}]|[\u{1F9CE}-\u{1F9CF}]|[\u{1F9D0}-\u{1F9D1}]|[\u{1F9D2}-\u{1F9D3}]|[\u{1F9D4}-\u{1F9D5}]|[\u{1F9D6}-\u{1F9D7}]|[\u{1F9D8}-\u{1F9D9}]|[\u{1F9DA}-\u{1F9DB}]|[\u{1F9DC}-\u{1F9DD}]|[\u{1F9DE}-\u{1F9DF}]|[\u{1F9E0}-\u{1F9E1}]|[\u{1F9E2}-\u{1F9E3}]|[\u{1F9E4}-\u{1F9E5}]|[\u{1F9E6}-\u{1F9E7}]|[\u{1F9E8}-\u{1F9E9}]|[\u{1F9EA}-\u{1F9EB}]|[\u{1F9EC}-\u{1F9ED}]|[\u{1F9EE}-\u{1F9EF}]|[\u{1F9F0}-\u{1F9F1}]|[\u{1F9F2}-\u{1F9F3}]|[\u{1F9F4}-\u{1F9F5}]|[\u{1F9F6}-\u{1F9F7}]|[\u{1F9F8}-\u{1F9F9}]|[\u{1F9FA}-\u{1F9FB}]|[\u{1F9FC}-\u{1F9FD}]|[\u{1F9FE}-\u{1F9FF}]/gu;
    
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
      },
      {
        pattern: emojiRegex,
        type: 'profanity'
      }
    ];
  }

  /**
   * Redact sensitive information from text
   * @param {string} text Text to redact
   * @param {string} lang Language code ('en' or 'fr')
   * @returns {{redactedText: string, redactedItems: Array<{value: string, type: string}>}}
   * @throws {Error} If service is not initialized
   */
  redactText(text, lang = 'en') {
    if (!this.isReady() || this.currentLang !== lang) {
      throw new Error('RedactionService is not initialized for the current language');
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
        // console.log(`Pattern ${index} matched: "${match}"`);
        redactedItems.push({ value: match, type });
        return type === 'private' ? 'XXX' : '####';
      });
    });

    return { redactedText, redactedItems };
  }
}

// Create and export a singleton instance
const redactionService = new RedactionService();

// Add a method to ensure the service is initialized before use
redactionService.ensureInitialized = async function(lang = 'en') {
  if (!this.isInitialized || this.currentLang !== lang) {
    console.log(`RedactionService not initialized, initializing now for language: ${lang}...`);
    await this.initialize(lang);
  }
  return this.isInitialized;
};

export default redactionService;