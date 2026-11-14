import mongoose from 'mongoose';
import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { User } from '../../models/user.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

// Options for the admin batch-scope dropdown on BatchPage: only the
// institutions, groups and users that have at least one batch.
async function batchListFiltersHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();

    const creatorIds = (await Batch.distinct('createdBy'))
      .filter((id) => typeof id === 'string' && mongoose.isValidObjectId(id));
    const users = creatorIds.length
      ? await User.find({ _id: { $in: creatorIds } }, { email: 1, institution: 1, group: 1 }).lean()
      : [];

    const institutions = [...new Set(users.map((u) => u.institution).filter(Boolean))].sort();
    const groups = [...new Set(users.map((u) => u.group).filter(Boolean))].sort();
    const userOptions = users
      .map((u) => ({ id: String(u._id), email: u.email || '' }))
      .sort((a, b) => a.email.localeCompare(b.email));

    return res.status(200).json({ institutions, groups, users: userOptions });
  } catch (error) {
    console.error('Error retrieving batch list filters:', error);
    return res.status(500).json({ message: 'Failed to retrieve batch list filters' });
  }
}

export default function handler(req, res) {
  return withProtection(batchListFiltersHandler, authMiddleware, adminMiddleware)(req, res);
}
