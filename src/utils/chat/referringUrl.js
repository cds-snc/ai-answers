// Validation for ChatOptions.js's referring-URL field. Any well-formed
// absolute http(s) URL passes — not restricted to canada.ca/gc.ca, so
// admins/partners can still test department-guessing against other URLs.
export const isWellFormedHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
