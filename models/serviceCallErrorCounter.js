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
  // 'error' = the call ultimately failed after all retries; 'retry' = one retry
  // attempt; cache lookup outcomes and outbound calls supply rate denominators.
  event: { type: String, required: true, enum: ['error', 'retry', 'cacheHit', 'cacheMiss', 'providerCall'] },
  count: { type: Number, required: true, default: 0 },
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

serviceCallErrorCounterSchema.index({ date: 1, service: 1, type: 1, event: 1 }, { unique: true });

// Keep the persisted Mongoose model name for the existing collection, while
// using a code identifier that reflects all recorded service-call events.
export const ServiceCallMetricCounter = mongoose.models.ServiceCallErrorCounter
  || mongoose.model('ServiceCallErrorCounter', serviceCallErrorCounterSchema);

export const ServiceCallErrorCounter = ServiceCallMetricCounter;
export default ServiceCallMetricCounter;
