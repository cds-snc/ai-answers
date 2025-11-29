import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '../models/user.js';
import dbConnect from '../api/db/db-connect.js';

// Serialize user to session (store minimal data)
passport.serializeUser((user, done) => {
  done(null, { 
    userId: user._id.toString(), 
    email: user.email, 
    role: user.role 
  });
});

// Deserialize user from session
passport.deserializeUser(async (sessionUser, done) => {
  try {
    await dbConnect();
    const user = await User.findById(sessionUser.userId);
    if (!user || !user.active) {
      return done(null, false);
    }
    // Return the session user object (not the full DB user)
    done(null, sessionUser);
  } catch (err) {
    done(err);
  }
});

// Local strategy for email/password authentication
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    await dbConnect();
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return done(null, false, { message: 'Invalid credentials' });
    }
    
    if (!user.active) {
      return done(null, false, { message: 'Account is deactivated' });
    }
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return done(null, false, { message: 'Invalid credentials' });
    }
    
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

export default passport;
