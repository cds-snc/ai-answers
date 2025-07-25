import dbConnect from '../api/db/db-connect.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { PublicFeedback } from '../models/publicFeedback.js';
import { Interaction } from '../models/interaction.js';

(async () => {
  try {
    await dbConnect();
    const oldPublic = await ExpertFeedback.find({ type: 'public' });
    for (const fb of oldPublic) {
      const publicDoc = new PublicFeedback({
        feedback: fb.feedback,
        publicFeedbackReason: fb.publicFeedbackReason,
        publicFeedbackScore: fb.publicFeedbackScore,
        createdAt: fb.createdAt,
        updatedAt: fb.updatedAt
      });
      await publicDoc.save();
      await Interaction.updateMany({ expertFeedback: fb._id }, {
        $set: { publicFeedback: publicDoc._id },
        $unset: { expertFeedback: 1 }
      });
      await fb.deleteOne();
    }
    console.log(`Migrated ${oldPublic.length} feedback documents`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    process.exit(1);
  }
})();
