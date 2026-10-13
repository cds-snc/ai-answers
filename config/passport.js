import passport from 'passport';
import bcrypt from 'bcryptjs';
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

// Password sign-in lockout: after MAX_LOGIN_ATTEMPTS wrong passwords the account
// rejects every sign-in (even the right password) until the lockout ends. The
// counter lives on the user document, so changing session or IP does not help.
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

// Compared against when the email is unknown, so an unknown account takes as
// long to reject as a known one.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Local strategy for email/password authentication
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    await dbConnect();
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      await bcrypt.compare(String(password), DUMMY_HASH);
      return done(null, false, { message: 'Invalid credentials' });
    }

    // Same message as a wrong password, so a lockout does not reveal anything.
    if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) {
      await bcrypt.compare(String(password), DUMMY_HASH); // match the timing of a real check
      return done(null, false, { message: 'Invalid credentials' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      const updated = await User.findOneAndUpdate(
        { _id: user._id },
        { $inc: { loginAttempts: 1 } },
        { new: true }
      );
      if (updated && updated.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        await User.updateOne({ _id: user._id }, {
          $set: { loginAttempts: 0, loginLockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) }
        });
      }
      return done(null, false, { message: 'Invalid credentials' });
    }

    // Checked after the password so an unauthenticated caller cannot use the
    // message to learn which emails belong to deactivated accounts.
    if (!user.active) {
      return done(null, false, { message: 'Account is deactivated' });
    }

    if (user.loginAttempts > 0 || user.loginLockedUntil) {
      await User.updateOne({ _id: user._id }, { $set: { loginAttempts: 0, loginLockedUntil: null } });
    }

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

export default passport;
