import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  status: { type: String, required: false, default: 'uploaded' },
  type: { type: String, required: true, default: '' },
  // The workflow selected when the batch was created (e.g. 'Default', 'DefaultWithVector')
  // Persisted so restarts can reuse the same workflow.
  workflow: { type: String, required: false, default: 'Default' },
  name: { type: String, required: true, default: '' },
  aiProvider: { type: String, required: true, default: '' },
  searchProvider: { type: String, required: false, default: '' },
  pageLanguage: { type: String, required: true, default: '' },

  
},{
  timestamps: true, versionKey: false,
  id: false,
});

// Expose model
export const Batch = mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
