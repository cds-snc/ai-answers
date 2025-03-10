import dbConnect from './db-connect.js';

export default async function handler(req, res) {
  try {
    console.log('Attempting to connect to database...');
    const conn = await dbConnect();
    console.log('Database connection successful');
    res.status(200).json({ message: 'Database connected successfully', details: conn.connections[0].name });
  } catch (error) {
    console.error('Failed to connect to database:', error);
    res.status(500).json({ 
      message: 'Failed to connect to database', 
      error: error.message,
      stack: error.stack
    });
  }
}