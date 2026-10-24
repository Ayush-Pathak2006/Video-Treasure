// Platforms allow far more tags than recommendations need, and list responses carry them.
const MAX_TAGS = 15;

/**
 * A platform's tags as stored on a Video: trimmed strings, without empty ones and repeats, at most MAX_TAGS.
 * Anything but an array (the platform sent none) gives undefined, so the field is left out.
 */
export const normalizeTags = tags =>
  Array.isArray(tags)
    ? [...new Set(tags.filter(tag => typeof tag === "string").map(tag => tag.trim()).filter(Boolean))].slice(0, MAX_TAGS)
    : undefined;
