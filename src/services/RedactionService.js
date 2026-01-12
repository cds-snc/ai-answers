/**
 * RedactionService.js
 * A service for redacting sensitive information from text content.
 */

import LoggingService from './ClientLoggingService.js';
import DataStoreService from './DataStoreService.js';

class RedactionService {
  constructor() {
    this.profanityPattern = null;
    this.manipulationPattern = null;
    this.threatPattern = null;
    this.isInitialized = false;
    this.currentLang = null;
  }

  isReady() {
    return this.isInitialized;
  }

  async initialize(lang = 'en') {
    try {
      this.currentLang = lang;

      const profanityWords = await this.loadWords(lang, 'profanity');
      const threatWords = await this.loadWords(lang, 'threat');
      const manipulationWords = await this.loadWords(lang, 'manipulation');

      this.profanityPattern = this.combinePatterns(profanityWords);
      this.threatPattern = this.combinePatterns(threatWords);
      this.manipulationPattern = this.combinePatterns(manipulationWords);

      this.isInitialized = true;
    } catch (error) {
      await LoggingService.error("system", 'Failed to initialize RedactionService:', error);
      this.isInitialized = false;
    }
  }

  async loadWords(lang, type) {
    try {
      // Use DataStoreService.getSetting instead of custom API
      const key = `redaction.${type}.${lang}`;
      const val = await DataStoreService.getSetting(key);
      if (!val) return [];

      const words = val.split(',').map(s => s.trim()).filter(Boolean);
      // await LoggingService.info("system", `Loaded ${type} words for ${lang}: ${words.length} words`);
      return words;
    } catch (error) {
      await LoggingService.error("system", `Error loading ${type} list for ${lang}:`, error);
      return [];
    }
  }

  combinePatterns(words) {
    if (!words || words.length === 0) {
      return null;
    }
    const escaped = words
      .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);

    if (escaped.length === 0) {
      return null;
    }

    // Add URL pattern if needed for manipulation
    // Kept simple for now to match other patterns
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  // Re-add manipulation pattern specifics from previous version if needed, 
  // but the comma-separated list should include phrases too.
  // The only special case was URL regex in manipulation.

  async initializeManipulationPattern(lang) {
    // Overridden by generic loader above, but we need to mix in the URL pattern
    // This method isn't called directly anymore in the simplified initialize()
  }

  get privatePatterns() {
    return [
      {
        pattern: /(\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/g,
        description: 'Phone numbers'
      },
      {
        pattern: /[A-Za-z]\s*\d\s*[A-Za-z]\s*[ -]?\s*\d\s*[A-Za-z]\s*\d/g,
        description: 'Canadian postal codes'
      },
      {
        pattern: /([a-zA-Z0-9_\-.]+)\s*@([\sa-zA-Z0-9_\-.]+)[.,]([a-zA-Z]{1,5})/g,
        description: 'Email addresses'
      },
      {
        pattern: /\d+\s+([A-Za-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|circle|cir|Loop)\b/gi,
        description: 'Street addresses'
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
        pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
        description: 'Canadian SIN'
      },
      {
        pattern: /\b(?:my name is|je m'appelle|je me nomme|my name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
        description: 'Names in introduction phrases'
      },
      {
        pattern: /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Madam|Lady|Monsieur|Madame|Mademoiselle|Docteur|Professeur)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
        description: 'Names with prefixes'
      },
      {
        pattern: /(?<=\b(name:|nom:)\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi,
        description: 'Name patterns in EN/FR'
      }
    ].map(({ pattern }) => pattern);
  }

  get redactionPatterns() {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F650}-\u{1F67F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{1F9B4}-\u{1F9B5}]|[\u{1F9B6}-\u{1F9B7}]|[\u{1F9B8}-\u{1F9B9}]|[\u{1F9BA}-\u{1F9BB}]|[\u{1F9BC}-\u{1F9BD}]|[\u{1F9BE}-\u{1F9BF}]|[\u{1F9C0}-\u{1F9C1}]|[\u{1F9C2}-\u{1F9C3}]|[\u{1F9C4}-\u{1F9C5}]|[\u{1F9C6}-\u{1F9C7}]|[\u{1F9C8}-\u{1F9C9}]|[\u{1F9CA}-\u{1F9CB}]|[\u{1F9CC}-\u{1F9CD}]|[\u{1F9CE}-\u{1F9CF}]|[\u{1F9D0}-\u{1F9D1}]|[\u{1F9D2}-\u{1F9D3}]|[\u{1F9D4}-\u{1F9D5}]|[\u{1F9D6}-\u{1F9D7}]|[\u{1F9D8}-\u{1F9D9}]|[\u{1F9DA}-\u{1F9DB}]|[\u{1F9DC}-\u{1F9DD}]|[\u{1F9DE}-\u{1F9DF}]|[\u{1F9E0}-\u{1F9E1}]|[\u{1F9E2}-\u{1F9E3}]|[\u{1F9E4}-\u{1F9E5}]|[\u{1F9E6}-\u{1F9E7}]|[\u{1F9E8}-\u{1F9E9}]|[\u{1F9EA}-\u{1F9EB}]|[\u{1F9EC}-\u{1F9ED}]|[\u{1F9EE}-\u{1F9EF}]|[\u{1F9F0}-\u{1F9F1}]|[\u{1F9F2}-\u{1F9F3}]|[\u{1F9F4}-\u{1F9F5}]|[\u{1F9F6}-\u{1F9F7}]|[\u{1F9F8}-\u{1F9F9}]|[\u{1F9FA}-\u{1F9FB}]|[\u{1F9FC}-\u{1F9FD}]|[\u{1F9FE}-\u{1F9FF}]/gu;

    return [
      ...this.privatePatterns.map(pattern => ({ pattern, type: 'private' })),
      { pattern: this.profanityPattern, type: 'profanity' },
      { pattern: this.threatPattern, type: 'threat' },
      { pattern: this.manipulationPattern, type: 'manipulation' },
      { pattern: emojiRegex, type: 'profanity' }
    ];
  }

  redactText(text, lang = 'en') {
    if (!this.isReady() || this.currentLang !== lang) {
      throw new Error('RedactionService is not initialized for the current language');
    }
    if (!text) return { redactedText: '', redactedItems: [] };

    let redactedText = text;
    const redactedItems = [];
    const validPatterns = this.redactionPatterns.filter(({ pattern }) => pattern !== null);

    validPatterns.forEach(({ pattern, type }) => {
      redactedText = redactedText.replace(pattern, (match) => {
        redactedItems.push({ value: match, type });
        return type === 'private' ? 'XXX' : '####';
      });
    });

    return { redactedText, redactedItems };
  }
}

const redactionService = new RedactionService();
redactionService.ensureInitialized = async function (lang = 'en') {
  if (!this.isInitialized || this.currentLang !== lang) {
    console.log(`RedactionService not initialized, initializing now for language: ${lang}...`);
    await this.initialize(lang);
  }
  return this.isInitialized;
};

export default redactionService;
