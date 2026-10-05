import { NICHE_TOPICS, getCombinedNicheQuery } from "../config/niches.config.js";

// Lowercase with single spaces, so "  Machine   LEARNING " and "machine learning" are the same search.
const normalize = value => (value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const resolveSearchIntent = rawQuery => {
  const input = normalize(rawQuery);

  // Only a search that IS a niche name or alias maps to the niche. Matching words inside a search
  // hijacked specific searches ("guitar lessons" contains "ui", "python coding interview" contains "coding").
  const matchedNiche = NICHE_TOPICS.find(niche => {
    const terms = [niche.name, ...(Array.isArray(niche.aliases) ? niche.aliases : [])];
    return terms.some(term => normalize(term) === input);
  });

  if (!matchedNiche) {
    // The normalized text is both the cache key and what the providers are asked, so "Guitar Lessons"
    // and "guitar lessons" share one cache entry and one QueryState page token.
    return {
      dbQuery: input,
      providerQuery: input,
      niche: null,
    };
  }

  return {
    dbQuery: matchedNiche.name,
    providerQuery: getCombinedNicheQuery(matchedNiche),
    niche: matchedNiche.name,
  };
};

// Intent for a key that is already in the cache. It's used exactly as stored, because keys cached before
// searches were normalized can still have capitals ("Guitar Lessons").
export const resolveCachedSearchIntent = cacheKey => {
  const intent = resolveSearchIntent(cacheKey);
  return intent.niche ? intent : { dbQuery: cacheKey, providerQuery: normalize(cacheKey), niche: null };
};
