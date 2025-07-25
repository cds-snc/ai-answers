import dbConnect from './db-connect.js';
import { Setting } from '../../models/setting.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingsHandler(req, res) {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ message: 'Key required' });
    }
    await dbConnect();
    const setting = await Setting.findOne({ key });
    return res.status(200).json({ key, value: setting ? setting.value : null });
  } else if (req.method === 'POST') {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ message: 'Key required' });
    }
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    return res.status(200).json({ message: 'Setting updated' });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
}

export default function handler(req, res) {
  return withProtection(settingsHandler, authMiddleware, adminMiddleware)(req, res);
}
