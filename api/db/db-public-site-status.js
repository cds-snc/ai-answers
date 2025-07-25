import dbConnect from './db-connect.js';
import { Setting } from '../../models/setting.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  const setting = await Setting.findOne({ key: 'siteStatus' });
  return res.status(200).json({ value: setting ? setting.value : 'unavailable' });
}
