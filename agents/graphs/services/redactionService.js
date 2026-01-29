import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { SettingsService } from '../../../services/SettingsService.js';

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

      // Load all settings first (SettingsService caches them)
      await SettingsService.loadAll();

      const profanityWords = this.loadWords(lang, 'profanity');
      const threatWords = this.loadWords(lang, 'threat');
      const manipulationWords = this.loadWords(lang, 'manipulation');

      this.profanityPattern = this.combinePatterns(profanityWords);
      this.threatPattern = this.combinePatterns(threatWords);
      this.manipulationPattern = this.combinePatterns(manipulationWords);

      this.isInitialized = true;
    } catch (error) {
      await ServerLoggingService.error('Failed to initialize RedactionService:', 'system', error);
      this.isInitialized = false;
    }
  }

  loadWords(lang, type) {
    try {
      const key = `redaction.${type}.${lang}`;
      const val = SettingsService.get(key);
      if (!val) return [];
      return val.split(',').map(s => s.trim()).filter(Boolean);
    } catch (error) {
      ServerLoggingService.error(`Error loading ${type} list for ${lang}:`, 'system', error);
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

    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  async ensureInitialized(lang) {
    if (!this.isInitialized || this.currentLang !== lang) {
      await this.initialize(lang);
    }
  }

  redactText(text = '', lang = 'en') {
    if (!this.isInitialized || this.currentLang !== lang) {
      // Auto-initialize if possible, or throw
      // For now, consistent with previous behavior
      throw new Error('RedactionService is not initialized for the current language');
    }

    if (!text) return { redactedText: text, redactedItems: [] };

    let redactedText = text;
    const redactedItems = [];

    const applyPattern = (pattern, replacement, type) => {
      if (!pattern) return;
      redactedText = redactedText.replace(pattern, match => {
        redactedItems.push({ type, match });
        return typeof replacement === 'function' ? replacement(match) : replacement;
      });
    };

    applyPattern(this.profanityPattern, match => '#'.repeat(match.length), 'profanity');
    applyPattern(this.threatPattern, match => '#'.repeat(match.length), 'threat');
    applyPattern(this.manipulationPattern, match => '#'.repeat(match.length), 'manipulation');

    // PII patterns — type 'private', replacement 'XXX'
    const piiPatterns = [
      // Phone numbers (North american format and extensions - international caught by second stage AI PI detection)
      { pattern: /(?<!\d)((\+\d{1,2}\s?)?1?[-.]?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?)(?!\d)/g, replacement: 'XXX', type: 'private' },
      // Canadian postal codes (with flexible spacing)
      { pattern: /[A-Za-z]\s*\d\s*[A-Za-z]\s*[ -]?\s*\d\s*[A-Za-z]\s*\d/g, replacement: 'XXX', type: 'private' },
      // Email addresses (with flexible spacing and punctuation)
      { pattern: /([a-zA-Z0-9_\-.]+)\s*@([\sa-zA-Z0-9_\-.]+)[.,]([a-zA-Z]{1,5})/g, replacement: 'XXX', type: 'private' },
      // Passport Numbers
      { pattern: /\b([A-Za-z]{2}\s*\d{6})\b/g, replacement: 'XXX', type: 'private' },
      // {
      //   pattern: /\b(?=[A-Z0-9-]*[0-9])(?=[A-Z0-9-]*[A-Z])(?!(?:GST\d{3}|RC\d{3}\b|RC\d+[A-Z-]*)\b)[A-Z0-9-]{6,}\b/gi,
      //   description: 'Alphanumeric sequences of 6+ chars (excluded — too many false positives on form numbers)'
      // },
      // {
      //   pattern: /\b(?<!\$)\d{6,}\b/g,
      //   description: 'Long number sequences 6+ digits (removed — too many false positives on serial/form/reference numbers)'
      // },
      // Name patterns in EN/FR
      { pattern: /(?<=\b(name\s+is|nom\s+est|name:|nom:)\s+)([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi, replacement: 'XXX', type: 'private' },
      // Street addresses
      { pattern: /\d+\s+([A-Za-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Parkway|Pkwy|Square|Sq|Terrace|Ter|Place|Pl|circle|cir|Loop)\b/gi, replacement: 'XXX', type: 'private' },
      // {
      //   pattern: /\b(?<!\$)\d{5}(?:-\d{4})?\b/g,
      //   description: 'US ZIP codes (excluded — catching too many CRA line/form numbers)'
      // },
      // Apartment/unit numbers
      { pattern: /\b(apt|bldg|dept|fl|hngr|lot|pier|rm|ste|slip|trlr|unit|#)\.? *\d+[a-z]?\b/gi, replacement: 'XXX', type: 'private' },
      // PO Box
      { pattern: /P\.? ?O\.? *Box +\d+/gi, replacement: 'XXX', type: 'private' },
      // IP addresses (IPv4 + IPv6)
      { pattern: /(\d{1,3}(\.\d{1,3}){3}|[0-9A-Fa-f]{4}(:[0-9A-Fa-f]{4}){7}|[0-9A-Fa-f]{4}(:[0-9A-Fa-f]{4}){5}(::|(:0000)+))/gi, replacement: 'XXX', type: 'private' },
      // URLs
      { pattern: /([^\s:/?#]+):\/\/([^/?#\s]*)([^?#\s]*)(\?([^#\s]*))?(#([^\s]*))?/g, replacement: 'XXX', type: 'private' },
      // Canadian SIN (Social Insurance Number)
      { pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g, replacement: 'XXX', type: 'private' },
      // Names with prefixes- other names caught in second stage AI PI detection
      { pattern: /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Madam|Lady|Monsieur|Madame|Mademoiselle|Docteur|Professeur)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, replacement: 'XXX', type: 'private' },
      // Names in introduction phrases - other names caught in second stage AI PI detection
      { pattern: /\b(?:my name is|je m'appelle|je me nomme|my name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi, replacement: 'XXX', type: 'private' },

    ];

    for (const { pattern, replacement, type } of piiPatterns) {
      applyPattern(pattern, replacement, type);
    }

    return { redactedText, redactedItems };
  }
}

export const redactionService = new RedactionService();
export default redactionService;
