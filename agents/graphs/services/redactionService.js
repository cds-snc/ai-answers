import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ServerLoggingService from '../../../services/ServerLoggingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const redactionsDir = path.join(__dirname, 'redactions');

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
      await this.initializeProfanityPattern(lang);
      await this.initializeThreatPattern(lang);
      await this.initializeManipulationPattern(lang);
      this.isInitialized = true;
    } catch (error) {
      await ServerLoggingService.error('Failed to initialize RedactionService:', 'system', error);
      this.isInitialized = false;
    }
  }

  async loadProfanityLists(lang) {
    try {
      const file = lang === 'fr' ? 'badwords_fr.txt' : 'badwords_en.txt';
      const text = await readFile(path.join(redactionsDir, file), 'utf8');
      const words = this.cleanWordList(text);
      await ServerLoggingService.info('Loaded profanity words', 'system', { lang, count: words.length });
      return words;
    } catch (error) {
      await ServerLoggingService.error(`Error loading profanity list for ${lang}:`, 'system', error);
      return [];
    }
  }

  async loadThreatLists(lang) {
    try {
      const file = lang === 'fr' ? 'threats_fr.txt' : 'threats_en.txt';
      const text = await readFile(path.join(redactionsDir, file), 'utf8');
      const words = this.cleanWordList(text);
      await ServerLoggingService.info('Loaded threat words', 'system', { lang, count: words.length });
      return words;
    } catch (error) {
      await ServerLoggingService.error(`Error loading threat list for ${lang}:`, 'system', error);
      return [];
    }
  }

  async initializeManipulationPattern(lang) {
    try {
      const file = lang === 'fr' ? 'manipulation_fr.json' : 'manipulation_en.json';
      const raw = await readFile(path.join(redactionsDir, file), 'utf8');
      const data = JSON.parse(raw);
      const patterns = Array.isArray(data?.patterns) ? data.patterns : [];
      this.manipulationPattern = this.combinePatterns(patterns);
    } catch (error) {
      this.manipulationPattern = null;
      await ServerLoggingService.error('Error loading manipulation patterns', 'system', error);
    }
  }

  cleanWordList(rawText) {
    if (!rawText) return [];
    return rawText
      .split('\n')
      .map(word => word.trim())
      .filter(word => word && !word.startsWith('#'));
  }

  async initializeProfanityPattern(lang) {
    const profanityWords = await this.loadProfanityLists(lang);
    this.profanityPattern = this.combinePatterns(profanityWords);
  }

  async initializeThreatPattern(lang) {
    const threatWords = await this.loadThreatLists(lang);
    this.threatPattern = this.combinePatterns(threatWords);
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

