import { Video } from "../models/video.model.js";
import { normalizeText } from "./videoRanking.js";

// Finds an already-cached search that means the same as a new one, so it's served from the DB instead of
// costing a new API search: "shape of you song" and "sape of yuo" both reuse "shape of you".

const INDEX_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_TOTAL_EDITS = 2;

// Trailing words that don't change what a search is about. Words that do ("lyrics", "cover", "remix") aren't here.
const FILLER_SUFFIXES = [
  "official music video",
  "music video",
  "official video",
  "official audio",
  "full video song",
  "video song",
  "full song",
  "full video",
  "song",
  "songs",
  "video",
  "videos",
  "official",
  "hd",
  "4k",
  "mv",
].map(phrase => phrase.split(" "));

// What's cached: every search key with its video count and comparable words, plus every word seen in a cached
// title. Built from the DB at most once an hour; searches made in this process are added as they're cached.
let index = null;
let buildInFlight = null;

const toWords = text => normalizeText(text).split(" ").filter(Boolean);

const endsWith = (words, suffix) =>
  words.length > suffix.length && suffix.every((word, i) => words[words.length - suffix.length + i] === word);

const stripFiller = words => {
  let core = words;
  let suffix = FILLER_SUFFIXES.find(candidate => endsWith(core, candidate));

  while (suffix) {
    core = core.slice(0, -suffix.length);
    suffix = FILLER_SUFFIXES.find(candidate => endsWith(core, candidate));
  }

  return core;
};

const addToIndex = (target, query, title) => {
  let search = target.searches.get(query);

  if (!search) {
    search = { query, count: 0, core: stripFiller(toWords(query)) };
    target.searches.set(query, search);
  }

  search.count += 1;
  toWords(title).forEach(word => target.vocabulary.add(word));
};

const buildIndex = async () => {
  const built = { builtAt: Date.now(), searches: new Map(), vocabulary: new Set() };
  const cursor = Video.find({ query: { $ne: null }, searchRank: { $ne: null } }).select("query title").lean().cursor();

  for await (const { query, title } of cursor) {
    addToIndex(built, query, title);
  }

  return built;
};

const getIndex = async () => {
  const isFresh = index && Date.now() - index.builtAt < INDEX_MAX_AGE_MS;

  if (!isFresh && !buildInFlight) {
    buildInFlight = buildIndex()
      .then(built => {
        index = built;
      })
      .catch(error => console.error(`❌ [similar-search] index build failed: ${error.message}`))
      .finally(() => {
        buildInFlight = null;
      });
  }

  // A stale index keeps answering while the new one builds; only the first search after a start waits.
  if (!index) await buildInFlight;
  return index;
};

// Edit distance that also counts swapping two neighbouring letters as one edit ("yuo" -> "you").
const editDistance = (a, b) => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }

  return rows[a.length][b.length];
};

// Edits needed for `word` to pass as a typo of `target`, or Infinity. Long words may differ by up to two letters.
// Short ones only by a missing, extra or swapped letter: one changed letter in a short word is usually a
// different word ("cats" vs "bats"). Numbers never match loosely ("iphone 15" is not "iphone 16").
const typoEdits = (word, target, vocabulary) => {
  if (word === target) return 0;
  // A word that appears in cached titles is a real word, not a typo ("kesariyo" is its own song).
  if (vocabulary.has(word) || /\d/.test(word + target)) return Infinity;

  const distance = editDistance(word, target);

  if (target.length >= 8) return distance <= 2 ? distance : Infinity;
  if (target.length >= 5) return distance <= 1 ? distance : Infinity;
  if (target.length >= 3 && distance === 1) {
    const isSubstitution = word.length === target.length && [...word].filter((letter, i) => letter !== target[i]).length === 1;
    return isSubstitution ? Infinity : 1;
  }

  return Infinity;
};

const matchEdits = (queryCore, searchCore, vocabulary) => {
  // Same words once filler and spaces are ignored: "shape of you song", "shapeof you".
  if (queryCore.join("") === searchCore.join("")) return 0;
  if (queryCore.length !== searchCore.length) return Infinity;

  let total = 0;

  for (let i = 0; i < queryCore.length && total <= MAX_TOTAL_EDITS; i += 1) {
    total += typoEdits(queryCore[i], searchCore[i], vocabulary);
  }

  return total <= MAX_TOTAL_EDITS ? total : Infinity;
};

/**
 * Cache key of an already-cached search that means the same as `query`, or null when `query` itself has cached
 * videos (it is used as-is) or nothing cached is close enough. Ties go to the search with more cached videos.
 */
export const findSimilarCachedSearch = async query => {
  if (await Video.exists({ query, searchRank: { $ne: null } })) return null;

  const queryCore = stripFiller(toWords(query));
  const currentIndex = queryCore.length ? await getIndex() : null;

  if (!currentIndex) return null;

  let best = null;

  for (const search of currentIndex.searches.values()) {
    const edits = matchEdits(queryCore, search.core, currentIndex.vocabulary);

    if (edits !== Infinity && (!best || edits < best.edits || (edits === best.edits && search.count > best.count))) {
      best = { query: search.query, edits, count: search.count };
    }
  }

  return best?.query ?? null;
};

// Called after videos are cached, so a search made a minute ago can already be matched.
export const rememberCachedSearch = (query, videos) => {
  if (!index) return;
  videos.forEach(video => addToIndex(index, query, video.title));
};
