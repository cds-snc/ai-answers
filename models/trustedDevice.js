import mongoose from 'mongoose';

// "Remember this device": one row per browser where a user ticked the box
// after a correct 2FA code. Only the SHA-256 of the cookie's random token is
// stored. See services/TrustedDeviceService.js and docs/plans/auth-hardening.md.
//
// No TTL index yet: expired rows are ignored by the lookup and pruned when the
// same user remembers another device. Confirm TTL index behaviour on
// DocumentDB 8 before adding one on expiresAt.
const trustedDeviceSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  expiresAt: { type: Date, required: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
});

trustedDeviceSchema.index({ tokenHash: 1 }, { unique: true });

export const TrustedDevice = mongoose.models.TrustedDevice
  || mongoose.model('TrustedDevice', trustedDeviceSchema);
