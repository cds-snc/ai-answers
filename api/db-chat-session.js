import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';


const secretKey = process.env.JWT_SECRET_KEY;

export default async function handler(req, res) {
    const readableId = uuidv4();

    const options = {
        jwtid: readableId,
        expiresIn: '1h'
    };
    
    const token = jwt.sign({}, secretKey, options);
    
    // Set cookie using headers instead of res.cookie
    res.setHeader('Set-Cookie', [
        `token=${token}; ` +
        'HttpOnly; ' +
        'Secure; ' +
        'SameSite=Strict; ' +
        'Path=/; ' +
        'Max-Age=3600'
    ]);

    return res.status(200).json({ chatId: readableId });
}