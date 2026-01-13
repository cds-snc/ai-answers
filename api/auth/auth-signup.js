import { User } from '../../models/user.js';
import dbConnect from '../db/db-connect.js';
import speakeasy from 'speakeasy';

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

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Check if this is the first user
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    // Generate secrets immediately to avoid race conditions later
    const twoFASecret = speakeasy.generateSecret({ length: 20 }).base32;
    const resetPasswordSecret = speakeasy.generateSecret({ length: 20 }).base32;

    // Create new user (automatically active if first user)
    const user = new User({
      email: normalizedEmail,
      password,
      role: isFirstUser ? "admin" : "partner",
      active: isFirstUser, // First user is automatically active
      twoFASecret,
      resetPasswordSecret
    });
    await user.save();

    // Log user in using Passport
    req.login(user, (err) => {
      if (err) {
        console.error('Login after signup error:', err);
        return res.status(500).json({
          success: false,
          message: 'Signup succeeded but login failed'
        });
      }

      // Return success with user data
      return res.status(201).json({
        success: true,
        message: isFirstUser
          ? 'User created successfully as admin.'
          : 'User created successfully. Account requires activation by an administrator.',
        user: {
          email: user.email,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt
        }
      });
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