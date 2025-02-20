import jwt from 'jsonwebtoken';

const secretKey = process.env.JWT_SECRET_KEY;

export default async function handler(req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Token missing.');
  
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) return res.status(403).send('Invalid or expired token.');
      console.log(`Readable ID (jti): ${decoded.jti}`);
      next();
    });
};