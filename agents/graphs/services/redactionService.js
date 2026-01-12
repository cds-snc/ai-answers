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

    // Basic PII patterns
    const piiPatterns = [
      { pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, replacement: 'XXX-XXX-XXXX', type: 'phone' },
      { pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, replacement: 'XXX-XXX-XXXX', type: 'phone' },
      { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: 'XXX@EMAIL', type: 'email' },
      { pattern: /\b\d{9}\b/g, replacement: 'XXXXXXXXX', type: 'number' },
    ];

    for (const { pattern, replacement, type } of piiPatterns) {
      applyPattern(pattern, replacement, type);
    }

    return { redactedText, redactedItems };
  }
}

export const redactionService = new RedactionService();
export default redactionService;
