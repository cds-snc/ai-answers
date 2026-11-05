import mongoose from 'mongoose';
const Schema = mongoose.Schema;

// What one edit of an expert evaluation changed: the old values of only those
// fields, so the edit can be undone by hand. createdAt is when it happened.
// Recovery only: nothing that builds answers or search data may read this.
// TODO: entries have no updatedAt, but the Database page's export filters by it
// (api/db/db-database-management.js), so date-filtered exports likely skip them.
const expertFeedbackRevisionSchema = new Schema({
    interactionId: { type: Schema.Types.ObjectId, ref: 'Interaction', required: true },
    expertFeedbackId: { type: Schema.Types.ObjectId, ref: 'ExpertFeedback', required: true },
    editedBy: { type: String, required: false, default: '' },
    previous: { type: Schema.Types.Mixed, required: true },
}, {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    id: false,
});

expertFeedbackRevisionSchema.index({ interactionId: 1 });
expertFeedbackRevisionSchema.index({ expertFeedbackId: 1 });

export const ExpertFeedbackRevision = mongoose.models.ExpertFeedbackRevision || mongoose.model('ExpertFeedbackRevision', expertFeedbackRevisionSchema);
