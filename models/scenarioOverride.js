import mongoose from 'mongoose';

const scenarioOverrideSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  departmentKey: { type: String, required: true },
  overrideText: { type: String, required: true },
  enabled: { type: Boolean, default: true },

}, {
  timestamps: true,
  versionKey: false,
  id: false
});

scenarioOverrideSchema.index({ userId: 1, departmentKey: 1 }, { unique: true });

export const ScenarioOverride = mongoose.models.ScenarioOverride || mongoose.model('ScenarioOverride', scenarioOverrideSchema);

