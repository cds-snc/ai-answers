import { User } from '../models/user.js';
import dbConnect from '../api/db/db-connect.js';

// Simplified auth middleware using Passport
export const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required' });
};

const verifyAuth = async (req, res) => {
  if (!req.isAuthenticated()) {
    console.log('Auth failed: User not authenticated');
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }

  console.log('Auth successful for user:', { userId: req.user?.userId, role: req.user?.role });
  return true;
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

// Optional authentication: sets req.user if valid session exists, but does NOT block if no session
// Used for endpoints that work for both authenticated and anonymous users
// req.user is automatically populated by Passport if authenticated
export const withOptionalUser = (handler) => async (req, res) => {
  return handler(req, res);
};

export const authMiddleware = verifyAuth;
export const adminMiddleware = verifyAdmin;
export const partnerOrAdminMiddleware = verifyPartnerOrAdmin;