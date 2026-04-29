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

    // Emoji — treated as profanity (replaced with '#')
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F650}-\u{1F67F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{1F9B4}-\u{1F9B5}]|[\u{1F9B6}-\u{1F9B7}]|[\u{1F9B8}-\u{1F9B9}]|[\u{1F9BA}-\u{1F9BB}]|[\u{1F9BC}-\u{1F9BD}]|[\u{1F9BE}-\u{1F9BF}]|[\u{1F9C0}-\u{1F9C1}]|[\u{1F9C2}-\u{1F9C3}]|[\u{1F9C4}-\u{1F9C5}]|[\u{1F9C6}-\u{1F9C7}]|[\u{1F9C8}-\u{1F9C9}]|[\u{1F9CA}-\u{1F9CB}]|[\u{1F9CC}-\u{1F9CD}]|[\u{1F9CE}-\u{1F9CF}]|[\u{1F9D0}-\u{1F9D1}]|[\u{1F9D2}-\u{1F9D3}]|[\u{1F9D4}-\u{1F9D5}]|[\u{1F9D6}-\u{1F9D7}]|[\u{1F9D8}-\u{1F9D9}]|[\u{1F9DA}-\u{1F9DB}]|[\u{1F9DC}-\u{1F9DD}]|[\u{1F9DE}-\u{1F9DF}]|[\u{1F9E0}-\u{1F9E1}]|[\u{1F9E2}-\u{1F9E3}]|[\u{1F9E4}-\u{1F9E5}]|[\u{1F9E6}-\u{1F9E7}]|[\u{1F9E8}-\u{1F9E9}]|[\u{1F9EA}-\u{1F9EB}]|[\u{1F9EC}-\u{1F9ED}]|[\u{1F9EE}-\u{1F9EF}]|[\u{1F9F0}-\u{1F9F1}]|[\u{1F9F2}-\u{1F9F3}]|[\u{1F9F4}-\u{1F9F5}]|[\u{1F9F6}-\u{1F9F7}]|[\u{1F9F8}-\u{1F9F9}]|[\u{1F9FA}-\u{1F9FB}]|[\u{1F9FC}-\u{1F9FD}]|[\u{1F9FE}-\u{1F9FF}]/gu;
    applyPattern(emojiRegex, match => '#'.repeat(match.length), 'profanity');

    // PII patterns — type 'private', replacement 'XXX'
    const piiPatterns = [
      // Phone numbers (North american format and extensions - international caught by second stage AI PI detection)
      { pattern: /(?<!\d)((\+\d{1,2}\s?)?1?[-.]?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?)(?!\d)/g, replacement: 'XXX', type: 'private' },
      // Canadian postal codes (with flexible spacing)
      { pattern: /[A-Za-z]\s*\d\s*[A-Za-z]\s*[ -]?\s*\d\s*[A-Za-z]\s*\d/g, replacement: 'XXX', type: 'private' },
      // Email addresses (with flexible spacing and punctuation)
      { pattern: /([a-zA-Z0-9_\-.]+)\s*@([\sa-zA-Z0-9_\-.]+)[.,]([a-zA-Z]{1,5})/g, replacement: 'XXX', type: 'private' },
      // {
      //   pattern: /\b([A-Za-z]{2}\s*\d{6})\b/g,
      //   description: 'Passport numbers (removed — false positives on form numbers like IMM1294, PPTC326 etc. Caught by AI stage instead)'
      // },
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
      // Names with prefixes (use lookbehind to preserve prefix)
      { pattern: /(?<=\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Sir|Madam|Lady|Monsieur|Madame|Mademoiselle|Docteur|Professeur)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, replacement: 'XXX', type: 'private' },
      // Names in introduction phrases (use lookbehind)
      { pattern: /(?<=\b(my name is|je m'appelle|je me nomme|my name's)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi, replacement: 'XXX', type: 'private' },

    ];

    for (const { pattern, replacement, type } of piiPatterns) {
      applyPattern(pattern, replacement, type);
    }

    if (redactedItems.length > 0) {
      console.log(`[Server RedactionService] Redacted items detected:`, JSON.stringify(redactedItems));
    }

    return { redactedText, redactedItems };
  }
}

export const redactionService = new RedactionService();
export default redactionService;
