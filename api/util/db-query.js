import mongoose from 'mongoose';

const DEFAULT_LITERAL_STRING_PATTERN = /^[-A-Za-z0-9._:]+$/;

function normalizeObjectIdCandidate(value) {
  if (value == null) {
    return null;
  }

  const candidate = typeof value === 'string'
    ? value.trim()
    : typeof value.toString === 'function'
      ? String(value.toString()).trim()
      : '';

  if (!candidate || !mongoose.Types.ObjectId.isValid(candidate)) {
    return null;
  }

  return new mongoose.Types.ObjectId(candidate).toString();
}

// Strict helper for request data. Only plain strings are accepted so we do not
// accidentally treat objects with custom `toString()` implementations as IDs.
export function normalizeObjectIdString(value) {
  return typeof value === 'string' ? normalizeObjectIdCandidate(value) : null;
}

// Broader helper for values already loaded from MongoDB, where ObjectId
// instances are expected and safe to normalize before re-querying.
export function normalizeObjectId(value) {
  return normalizeObjectIdCandidate(value);
}

export function requireObjectIdString(value, fieldName = 'id') {
  const normalized = normalizeObjectIdString(value);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}

export function normalizeLiteralString(value, {
  maxLength = 128,
  pattern = DEFAULT_LITERAL_STRING_PATTERN,
} = {}) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || !pattern.test(normalized)) {
    return null;
  }

  return normalized;
}

export function requireLiteralString(value, fieldName = 'value', options) {
  const normalized = normalizeLiteralString(value, options);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}
