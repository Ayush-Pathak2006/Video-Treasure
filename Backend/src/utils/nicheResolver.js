import { NICHE_TOPICS, getCombinedNicheQuery } from "../config/niches.config.js";

const normalize = value => (value || "").trim().toLowerCase();

export const resolveSearchIntent = rawQuery => {
  const input = normalize(rawQuery);

  const matchedNiche = NICHE_TOPICS.find(niche => {
    const nicheName = normalize(niche.name);
    return nicheName === input || input.includes(nicheName);
  });

  if (!matchedNiche) {
    return {
      dbQuery: rawQuery,
      providerQuery: rawQuery,
      niche: null,
    };
  }

  return {
    dbQuery: matchedNiche.name,
    providerQuery: getCombinedNicheQuery(matchedNiche),
    niche: matchedNiche.name,
  };
};