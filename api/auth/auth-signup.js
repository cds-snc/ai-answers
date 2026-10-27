import { User } from '../../models/user.js';
import dbConnect from '../db/db-connect.js';
import speakeasy from 'speakeasy';
import { isValidEmail, normalizeEmail } from '../../src/utils/auth/validateEmail.js';
import { meetsPasswordRule } from '../../src/utils/auth/passwordRule.js';

const DUPLICATE_KEY = 11000;

const alreadyExists = (res) => res.status(400).json({
  success: false,
  message: 'User already exists'
});

const signupHandler = async (req, res) => {
  try {
    await dbConnect();
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // The pages check both of these first; this stops direct API calls.
    if (typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }
    const normalizedEmail = normalizeEmail(email).toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }
    if (!meetsPasswordRule(password)) {
      return res.status(400).json({ success: false, message: 'Password does not meet the rule' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return alreadyExists(res);
    }

    // Generate secrets immediately to avoid race conditions later
    const resetPasswordSecret = speakeasy.generateSecret({ length: 20 }).base32;

    // The first user ever is created as an active admin, in the same write.
    // isFirstAdmin has a unique index, so if two sign-ups both find the
    // database empty, only one save can claim it.
    const buildUser = (asFirstAdmin) => new User({
      email: normalizedEmail,
      password,
      role: asFirstAdmin ? 'admin' : 'partner',
      active: asFirstAdmin,
      resetPasswordSecret,
      ...(asFirstAdmin ? { isFirstAdmin: true } : {})
    });

    const databaseIsEmpty = !(await User.exists({}));
    let user = buildUser(databaseIsEmpty);
    try {
      await user.save();
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err;
      // A partner save can only collide on the email (a double submit).
      if (!databaseIsEmpty) return alreadyExists(res);
      // Either another sign-up claimed isFirstAdmin first, or the email is
      // taken. Saving as a partner settles both without reading which index
      // failed: it succeeds in the first case and collides on the email again
      // in the second.
      user = buildUser(false);
      try {
        await user.save();
      } catch (retryErr) {
        if (retryErr?.code === DUPLICATE_KEY) return alreadyExists(res);
        throw retryErr;
      }
    }

    const body = {
      success: true,
      message: user.active
        ? 'User created successfully as admin.'
        : 'User created successfully. Account requires activation by an administrator.',
      user: {
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt
      }
    };

    // Don't log in an inactive user: the session would carry passport.user,
    // and the rate limiter would treat it as signed in (plan F3).
    if (!user.active) {
      return res.status(201).json(body);
    }

    // Log user in using Passport
    req.login(user, (err) => {
      if (err) {
        console.error('Login after signup error:', err);
        return res.status(500).json({
          success: false,
          message: 'Signup succeeded but login failed'
        });
      }
      return res.status(201).json(body);
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during signup'
    });
  }
};

export default signupHandler;
