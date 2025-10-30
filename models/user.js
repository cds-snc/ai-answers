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
    enum: ['user', 'admin'],
    default: 'user'
  },
  active: {
    type: Boolean,
    default: true
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
  resetPasswordToken: {
    type: String,
    default: null,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
  },
  // Fallback email OTP for password reset (if user doesn't use TOTP/WebAuthn)
  // (legacy) email OTP fields removed — email OTP fallback is no longer used
}, {
  timestamps: true,
  versionKey: false,
  id: false
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);