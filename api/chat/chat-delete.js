import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { requireString } from '../util/db-query.js';
import { canDeleteExpertFeedback } from '../util/expert-feedback-access.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

// Deleting a chat also deletes the expert evaluations in it. Admins may delete
// any chat. Others only one they started, and only if they could delete every
// evaluation in it themselves (canDeleteExpertFeedback), so nobody loses someone
// else's evaluation this way. Returns why not, as a code the screen
// translates, or null when allowed.
//
// TODO: discuss group-level permissions: members of a group deleting each
// other's chats, or a group admin who can delete any in their group.
async function whyCannotDeleteChat(user, chat) {
	if (user?.role === 'admin') return null;
	if (!user?.userId || !chat.user || String(chat.user) !== String(user.userId)) return 'notOwnChat';
	const interactions = await Interaction.find({ _id: { $in: chat.interactions } }, { expertFeedback: 1 }).lean();
	const feedbackIds = interactions.map((i) => i.expertFeedback).filter(Boolean);
	if (feedbackIds.length === 0) return null;
	const feedback = await ExpertFeedback.find({ _id: { $in: feedbackIds } }, { expertEmail: 1, type: 1 }).lean();
	for (const ef of feedback) {
		if (!await canDeleteExpertFeedback(user, ef)) return 'othersEvaluations';
	}
	return null;
}

async function deleteChatHandler(req, res) {
	if (req.method !== 'DELETE') {
		return res.status(405).json({ message: 'Method not allowed' });
	}

	try {
		await dbConnect();
		console.log('DB Connected in delete-chat endpoint');

		let { chatId } = req.query;
		if (!chatId) {
			return res.status(400).json({ message: 'Chat ID is required' });
		}
		chatId = requireString(chatId, 'chatId');

		const chat = await Chat.findOne({ chatId });
		if (!chat) {
			return res.status(404).json({ message: 'Chat not found' });
		}

		const refusal = await whyCannotDeleteChat(req.user, chat);
		if (refusal) {
			const message = refusal === 'notOwnChat'
				? 'You can only delete chats you started'
				: 'Deleting this chat would delete someone else\'s evaluation';
			return res.status(403).json({ message, code: refusal });
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
