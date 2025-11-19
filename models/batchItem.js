import mongoose from 'mongoose';

const BatchItemSchema = new mongoose.Schema({
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
  },
  rowIndex: { type: Number, required: false },
  // Raw original row data (kept for audit/export)
  originalData: { type: mongoose.Schema.Types.Mixed, required: false },

  // Link to Chat so the existing Chat -> Interaction structure is used as the single source of truth
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: false,
  },

  // Per-item error note (if processing failed)
  error: { type: String, required: false, default: '' },

  
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

export const BatchItem = mongoose.models.BatchItem || mongoose.model('BatchItem', BatchItemSchema);
