import mongoose from 'mongoose';

// Text-free counter for queries blocked by the safety/security guardrails before
// they ever reach the answer step of the graph. Blocked queries are intentionally
// never persisted as Chat/Interaction records, so this is the only place their
// volume is tracked. The question text is NEVER stored here — only which guardrail
// fired, when (day bucket), the page language, and a coarse user-type bucket.
//
// One document per (date, type, lang, userType); each block does an atomic
// $inc/upsert, so the collection stays small regardless of traffic.
const blockedQueryCounterSchema = new mongoose.Schema({
  // UTC midnight of the day the block occurred (day bucket for date-range filtering)
  date: { type: Date, required: true },
  // Which guardrail fired (see BLOCK_TYPES in services/BlockedQueryService.js)
  type: { type: String, required: true },
  // Page language: 'en' | 'fr' | 'other'
  lang: { type: String, required: true, default: 'other' },
  // Coarse user bucket: 'admin' | 'referredPublic' | 'publicOther'
  userType: { type: String, required: true, default: 'publicOther' },
  count: { type: Number, required: true, default: 0 },
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

blockedQueryCounterSchema.index({ date: 1, type: 1, lang: 1, userType: 1 }, { unique: true });

export const BlockedQueryCounter = mongoose.models.BlockedQueryCounter
  || mongoose.model('BlockedQueryCounter', blockedQueryCounterSchema);

export default BlockedQueryCounter;
