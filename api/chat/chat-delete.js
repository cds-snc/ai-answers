import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

async function deleteChatHandler(req, res) {
	if (req.method !== 'DELETE') {
		return res.status(405).json({ message: 'Method not allowed' });
	}

	try {
		await dbConnect();
		console.log('DB Connected in delete-chat endpoint');

		const { chatId } = req.query;
		if (!chatId) {
			return res.status(400).json({ message: 'Chat ID is required' });
		}

		const chat = await Chat.findOne({ chatId: chatId });
		if (!chat) {
			return res.status(404).json({ message: 'Chat not found' });
		}

		await chat.deleteOne();

		return res.status(200).json({
			success: true,
			message: 'Chat and all related records deleted successfully'
		});

	} catch (error) {
		console.error('API Error:', error);
		return res.status(500).json({
			error: 'Failed to delete chat',
			details: error.message
		});
	}
}

export default function handler(req, res) {
	// Require authentication and either partner or admin role to delete chats
	return withProtection(deleteChatHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
