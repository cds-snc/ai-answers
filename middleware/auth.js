import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import dbConnect from '../api/db/db-connect.js';

const JWT_SECRET = process.env.JWT_SECRET_KEY;

export const generateToken = (user) => {
  console.log('Generating token for user:', { userId: user._id, email: user.email, role: user.role });
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Utility to extract user from request without sending a response
export const getUserFromRequest = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    await dbConnect();
    const user = await User.findById(decoded.userId);
    if (!user) return null;
    return decoded;
  } catch (e) {
    return null;
  }
};

const handleCORS = (req, res) => {
  console.log('CORS handling for request:', { 
    method: req.method, 
    path: req.path,
    origin: req.headers.origin,
    headers: req.headers
  });

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    console.log('Set Access-Control-Allow-Origin to:', origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request');
      return res.status(200).end();
  }
  return true;
};

const verifyAuth = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Verifying auth with headers:', {
      authorization: authHeader,
      method: req.method,
      path: req.path
    });

    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Auth failed: No bearer token provided');
      res.status(401).json({ message: 'No token provided' });
      return false;
    }

    const token = authHeader.split(' ')[1];
    console.log('Attempting to verify token');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token verified successfully:', { userId: decoded.userId, role: decoded.role });
    await dbConnect();
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('Auth failed: User not found in database:', decoded.userId);
      res.status(401).json({ message: 'User not found' });
      return false;
    }

    console.log('Auth successful for user:', { userId: user._id, role: user.role });
    req.user = decoded;
    return true;
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
    return false;
  }
};

const verifyAdmin = (req, res) => {
  console.log('Verifying admin access for user:', { 
    userId: req.user?.userId,
    role: req.user?.role 
  });
  
  if (req.user.role !== 'admin') {
    console.log('Admin access denied for user:', req.user?.userId);
    res.status(403).json({ message: 'Admin access required' });
    return false;
  }
  console.log('Admin access granted for user:', req.user?.userId);
  return true;
};

// Verify partner role or admin (allows partners and admins)
const verifyPartnerOrAdmin = (req, res) => {
  console.log('Verifying partner or admin access for user:', { userId: req.user?.userId, role: req.user?.role });
  if (!req.user) {
    console.log('Partner/Admin access denied: no user present on request');
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }
  if (req.user.role !== 'partner' && req.user.role !== 'admin') {
    console.log('Partner/Admin access denied for user:', req.user?.userId);
    res.status(403).json({ message: 'Partner or admin access required' });
    return false;
  }
  console.log('Partner/Admin access granted for user:', req.user?.userId);
  return true;
};

export const withProtection = (handler, ...middleware) => {
  return async (req, res) => {
    console.log('withProtection wrapper called for:', {
      path: req.path,
      method: req.method,
      middlewareCount: middleware.length
    });

    // Handle CORS preflight before any middleware
    //const corsResult = handleCORS(req, res);
    //if (corsResult !== true) {
    //  console.log('CORS preflight handled, ending request');
    //  return corsResult;
    //}

    for (const mw of middleware) {
      console.log('Executing middleware:', mw.name);
      const result = await mw(req, res);
      if (!result) {
        console.log('Middleware check failed:', mw.name);
        return;
      }
    }
    console.log('All middleware passed, executing handler');
    return handler(req, res);
  };
};

// Optional authentication: sets req.user if valid token, does not block if not
export const withOptionalUser = (handler) => async (req, res) => {
  req.user = await getUserFromRequest(req); // Use new utility
  return handler(req, res);
};

export const withUser = (handler) => async (req, res) => {
  req.user = await getUserFromRequest(req); // Use new utility
  return handler(req, res);
};


export const authMiddleware = verifyAuth;
export const adminMiddleware = verifyAdmin;
export const partnerOrAdminMiddleware = verifyPartnerOrAdmin;