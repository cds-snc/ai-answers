import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import dbConnect from '../api/db/db-connect.js';

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d';

// Generate access token (short-lived)
export const generateToken = (user, expiresIn = ACCESS_TOKEN_EXPIRES_IN) => {
  console.log('Generating access token for user:', { userId: user._id, email: user.email, role: user.role, expiresIn });
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn }
  );
};

// Generate refresh token (long-lived)
export const generateRefreshToken = (user) => {
  console.log('Generating refresh token for user:', { userId: user._id, expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  return jwt.sign(
    { userId: user._id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

// Utility to extract user from cookie without sending a response
export const getUserFromCookie = async (req) => {
  const token = req.cookies?.access_token;
  if (!token) return null;
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

const verifyAuth = async (req, res) => {
  try {
    const token = req.cookies?.access_token;
    console.log('Verifying auth with cookie:', {
      hasCookie: !!token,
      method: req.method,
      path: req.path
    });

    if (!token) {
      console.log('Auth failed: No access token cookie provided');
      res.status(401).json({ message: 'No token provided' });
      return false;
    }

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

export const authMiddleware = verifyAuth;
export const adminMiddleware = verifyAdmin;
export const partnerOrAdminMiddleware = verifyPartnerOrAdmin;