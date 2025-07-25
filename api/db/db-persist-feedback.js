import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function feedbackHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    
    const interaction = req.body;
    let chatId = interaction.chatId;
    let interactionId = interaction.interactionId;
    const expertFeedbackData = req.body.expertFeedback;
    const publicFeedbackData = req.body.publicFeedback;
    
    console.log('Received feedback:', JSON.stringify({ expertFeedbackData, publicFeedbackData }, null, 2));

    let chat = await Chat.findOne({ chatId: chatId }).populate({path: 'interactions'});
    let existingInteraction = chat.interactions.find(interaction => interaction.interactionId == interactionId);
    
    if (expertFeedbackData) {
      let expertFeedback = new ExpertFeedback();
      Object.assign(expertFeedback, expertFeedbackData);
      existingInteraction.expertFeedback = expertFeedback._id;
      console.log('Saving expert feedback:', JSON.stringify(expertFeedback.toObject(), null, 2));
      await expertFeedback.save();
    }

    if (publicFeedbackData) {
      let publicFeedback = new PublicFeedback();
      Object.assign(publicFeedback, publicFeedbackData);
      existingInteraction.publicFeedback = publicFeedback._id;
      console.log('Saving public feedback:', JSON.stringify(publicFeedback.toObject(), null, 2));
      await publicFeedback.save();
    }
    await existingInteraction.save();

    res.status(200).json({ message: 'Feedback logged successfully' });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ message: 'Failed to log Feedback', error: error.message });
  }
}

export default feedbackHandler;