import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'partner'],
    default: 'partner'
  },
  active: {
    type: Boolean,
    default: true
  },
  // Institution the user belongs to, as a partner department abbrKey from
  // src/constants/partnerDepartments.js ('' = unassigned). Set by an admin
  // (Manage user accounts page) or once by the user (Manage your account
  // page; api/user/user-me.js locks it for partners after that). Seeds the
  // dashboards' department filter via preferences.prefilterDepartment and
  // scopes who a partner can assign chats to (api/chat/chat-assign-interaction.js).
  // Orthogonal to a chat's context.department - a DND reviewer can
  // evaluate an IRCC chat.
  institution: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  // Group / team within the institution, one of
  // src/constants/partnerGroups.js ('' = none). Set the same two ways as
  // institution (not collected at signup). Drives the reviewer filter
  // (api/util/reviewer-filter.js) via preferences.prefilterGroup and the
  // chat-assign-interaction membership rule.
  group: {
    type: String,
    default: '',
    trim: true
  },
  // Self-service preferences, edited on the Account dashboard page.
  preferences: {
    // Open dashboards with the Partner institution filter set to the
    // user's own institution (needs `institution` to be set).
    prefilterDepartment: { type: Boolean, default: false },
    // Apply the reviewer filter for the user's own group on every dashboard
    // (chats created or evaluated by group members). Needs `group` set.
    prefilterGroup: { type: Boolean, default: false }
  },
  // Two factor authentication challenge (services/TwoFAService.js).
  // twoFACode is an HMAC of the emailed one-time code, never the code itself.
  twoFACode: {
    type: String,
    default: null,
  },
  twoFAExpires: {
    type: Date,
    default: null,
  },
  // Wrong-code count. NOT reset when a new code is sent, only on success or
  // after the lockout ends, so asking for fresh codes can't buy more guesses.
  twoFAAttempts: {
    type: Number,
    default: 0,
  },
  twoFALockedUntil: {
    type: Date,
    default: null,
  },
  twoFALastSentAt: {
    type: Date,
    default: null,
  },
  // Legacy TOTP secret. No longer used for sign-in codes; kept so existing
  // documents still load. Safe to drop in a later cleanup migration.
  twoFASecret: {
    type: String,
    default: null,
  },
  // Password sign-in lockout (config/passport.js)
  loginAttempts: {
    type: Number,
    default: 0,
  },
  loginLockedUntil: {
    type: Date,
    default: null,
  },
  // When loginAttempts last went up; older than LOGIN_ATTEMPT_WINDOW_MS means start the count again.
  loginLastFailedAt: {
    type: Date,
    default: null,
  },
  // Password reset fields
  // Permanent secret for TOTP password reset codes
  resetPasswordSecret: {
    type: String,
    default: null,
  },
  // Track failed reset code attempts for account-level lockout
  resetPasswordAttempts: {
    type: Number,
    default: 0,
  },
  // Lockout timestamp after too many failed reset attempts
  resetPasswordLockedUntil: {
    type: Date,
    default: null,
  },

}, {
  timestamps: true,
  versionKey: false,
  id: false
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);