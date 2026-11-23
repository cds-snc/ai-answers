import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

// Admin diagnostic. The database name and driver errors stay in the server log.
async function dbCheckHandler(req, res) {
  try {
    console.log('Attempting to connect to database...');
    await dbConnect();
    console.log('Database connection successful');
    return res.status(200).json({ message: 'Database connected successfully' });
  } catch (error) {
    console.error('Failed to connect to database:', error);
    return res.status(500).json({ message: 'Failed to connect to database' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // withProtection is async; await it so session or auth throws still yield a 500
  // when nothing has been written to the response yet.
  try {
    return await withProtection(dbCheckHandler, authMiddleware, adminMiddleware)(req, res);
  } catch (error) {
    console.error('Database check failed:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Failed to complete database check' });
    }
  }
}
