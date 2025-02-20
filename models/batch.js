import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  status: { type: String, required: false, default: '' },
  batchId: { type: String, required: true, default: '' },
  type: { type: String, required: true, default: '' },
  name: { type: String, required: true, default: '' },
  aiProvider: { type: String, required: true, default: '' },
  pageLanguage: { type: String, required: true, default: '' },
  
  interactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interaction'
  }]
},{
  timestamps: true, versionKey: false,
  id: false,
});

export const Batch = mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
