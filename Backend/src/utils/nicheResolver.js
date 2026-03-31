import { NICHE_TOPICS, getCombinedNicheQuery } from "../config/niches.config.js";

const normalize = value => (value || "").trim().toLowerCase();

export const resolveSearchIntent = rawQuery => {
  const input = normalize(rawQuery);

  const matchedNiche = NICHE_TOPICS.find(niche => {
    const nicheName = normalize(niche.name);
    const aliases = Array.isArray(niche.aliases) ? niche.aliases.map(normalize) : [];

    if (nicheName === input || input.includes(nicheName)) {
      return true;
    }

    return aliases.some(alias => alias && (alias === input || input.includes(alias)));
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