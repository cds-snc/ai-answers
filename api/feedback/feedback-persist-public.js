import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { PublicFeedback } from '../../models/publicFeedback.js';


async function feedbackPersistPublicHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const { chatId, interactionId, publicFeedback } = req.body;
    if (!chatId || !interactionId || !publicFeedback) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    let chat = await Chat.findOne({ chatId }).populate({ path: 'interactions' });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    let existingInteraction = chat.interactions.find(interaction => interaction.interactionId == interactionId);
    if (!existingInteraction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    let publicFeedbackDoc = new PublicFeedback();
    Object.assign(publicFeedbackDoc, publicFeedback);
    existingInteraction.publicFeedback = publicFeedbackDoc._id;
    await publicFeedbackDoc.save();
    await existingInteraction.save();
    res.status(200).json({ message: 'Public feedback logged successfully' });
  } catch (error) {
    console.error('Error saving public feedback:', error);
    res.status(500).json({ message: 'Failed to log public feedback', error: error.message });
  }
}

export default feedbackPersistPublicHandler;
