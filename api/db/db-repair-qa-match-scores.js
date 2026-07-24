import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { Context } from '../../models/context.js';
import { Interaction } from '../../models/interaction.js';

async function repairQaMatchScoresHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  try {
    await dbConnect();
    const contexts = await Context.find({ 'qaMatches.0': { $exists: true } }).select('_id qaMatches').lean();
    const interactionIds = [...new Set(contexts.flatMap((context) => (context.qaMatches || []).map((match) => match.interactionId).filter(Boolean)))];
    const interactions = interactionIds.length
      ? await Interaction.find({ _id: { $in: interactionIds } }).select('_id expertFeedback').populate({ path: 'expertFeedback', select: 'totalScore' }).lean()
      : [];
    const scoreByInteractionId = new Map(interactions.map((interaction) => [String(interaction._id), interaction.expertFeedback?.totalScore ?? null]));
    const operations = [];
    let matches = 0;
    for (const context of contexts) {
      for (const match of context.qaMatches || []) {
        if (!match.interactionId || !scoreByInteractionId.has(String(match.interactionId))) continue;
        matches += 1;
        const totalScore = scoreByInteractionId.get(String(match.interactionId));
        if (match.totalScore === totalScore) continue;
        operations.push({
          updateOne: {
            filter: { _id: context._id },
            update: { $set: { 'qaMatches.$[match].totalScore': totalScore } },
            arrayFilters: [{ 'match.interactionId': String(match.interactionId) }],
          },
        });
      }
    }
    if (operations.length) await Context.bulkWrite(operations, { ordered: false });
    return res.status(200).json({ success: true, stats: { matches, updated: operations.length } });
  } catch (error) {
    console.error('QA match score repair error:', error);
    return res.status(500).json({ message: 'QA match score repair failed', error: error.message });
  }
}

export default withProtection(repairQaMatchScoresHandler, authMiddleware, adminMiddleware);
