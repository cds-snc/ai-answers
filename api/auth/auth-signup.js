import { User } from '../../models/user.js';
import { generateToken } from '../../middleware/auth.js';
import dbConnect from '../db/db-connect.js';

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

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Check if this is the first user
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    // Create new user (automatically active if first user)
    const user = new User({ 
      email, 
      password,
      role: "admin",
      active: isFirstUser // First user is automatically active
    });
    await user.save();

    // Generate JWT token
    const token = generateToken(user);

    // Return success with token and user data
    res.status(201).json({
      success: true,
      message: isFirstUser 
        ? 'User created successfully as admin.' 
        : 'User created successfully. Account requires activation by an administrator.',
      token,
      user: {
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt
      }
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