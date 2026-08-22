import mongoose from 'mongoose';

// Text-free counter for errors/retries on outbound calls outside the normal
// Tool-tracking path (search + context/answer LLM calls aren't LangChain
// agent tool calls, so ToolTrackingHandler never sees them). Mirrors
// models/blockedQueryCounter.js: one document per (date, service, type,
// event), each occurrence an atomic $inc/upsert.
const serviceCallErrorCounterSchema = new mongoose.Schema({
  // UTC midnight of the day the event occurred (day bucket for date-range filtering)
  date: { type: Date, required: true },
  // Which outbound service: 'search' | 'ai'
  service: { type: String, required: true },
  // Which call within that service: 'google' | 'canadaca' (search); 'context' | 'answer' (ai)
  type: { type: String, required: true },
  // 'error' = the call ultimately failed after all retries; 'retry' = one retry attempt
  event: { type: String, required: true, enum: ['error', 'retry'] },
  count: { type: Number, required: true, default: 0 },
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

serviceCallErrorCounterSchema.index({ date: 1, service: 1, type: 1, event: 1 }, { unique: true });

export const ServiceCallErrorCounter = mongoose.models.ServiceCallErrorCounter
  || mongoose.model('ServiceCallErrorCounter', serviceCallErrorCounterSchema);

export default ServiceCallErrorCounter;
