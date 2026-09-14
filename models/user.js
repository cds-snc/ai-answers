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
  // src/constants/partnerDepartments.js ('' = unassigned). Drives the
  // dashboards' "Institution" filter (chats created or reviewed by anyone in
  // the institution). Orthogonal to a chat's context.department - a DND
  // reviewer can evaluate an IRCC chat.
  institution: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  // Group / team within the institution, one of
  // src/constants/partnerGroups.js ('' = none). Self-declared at signup,
  // confirmed by an admin. Informational only for now.
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
  // Two factor authentication fields
  twoFACode: {
    type: String,
    default: null,
  },
  twoFAExpires: {
    type: Date,
    default: null,
  }
  ,
  // If using otplib TOTP flow, store a per-user secret
  twoFASecret: {
    type: String,
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