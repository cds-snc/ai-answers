import dbConnect from './db-connect.js';
import { Chat } from '../models/chat.js';
import { ExpertFeedback } from '../models/expertFeedback.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    
    const interaction = req.body;
    let chatId = interaction.chatId;
    let interactionId = interaction.interactionId;
    const feedback = req.body.expertFeedback;
    
    console.log('Received feedback:', JSON.stringify(feedback, null, 2));

    let chat = await Chat.findOne({ chatId: chatId }).populate({path: 'interactions'});
    let existingInteraction = chat.interactions.find(interaction => interaction.interactionId == interactionId);
    
    let expertFeedback = new ExpertFeedback();
    // Ensure we're copying all fields, including harmful flags
    const feedbackFields = {
      ...feedback
    };
    
    existingInteraction.expertFeedback = expertFeedback._id;
    Object.assign(expertFeedback, feedbackFields);
    
    console.log('Saving feedback:', JSON.stringify(expertFeedback.toObject(), null, 2));
    
    await expertFeedback.save();
    await existingInteraction.save();

    res.status(200).json({ message: 'Feedback logged successfully' });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ message: 'Failed to log Feedback', error: error.message });
  }
}