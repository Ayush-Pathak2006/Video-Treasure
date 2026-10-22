// Where a visitor goes after logging in. sessionStorage survives Google login's full-page redirect. When storage is
// blocked, the visitor just lands on Home. Only the latest intent is kept: a page to return to (the Player) replaces
// a saved search, and the other way round.
const RETURN_TO_KEY = "videoTreasure.returnTo";
const RESUME_SEARCH_KEY = "videoTreasure.resumeSearch";

const take = key => {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
};

const remember = (key, value, replacedKey) => {
  try {
    sessionStorage.setItem(key, value);
    sessionStorage.removeItem(replacedKey);
  } catch {
    // Storage is blocked.
  }
};

// Log in or Sign up was clicked on a page to come back to.
export const rememberReturnTo = path => remember(RETURN_TO_KEY, path, RESUME_SEARCH_KEY);

// Log in or Sign up was clicked on Home's limit card: run that search again afterwards.
export const rememberSearch = query => remember(RESUME_SEARCH_KEY, query, RETURN_TO_KEY);

// Reads and forgets the page to return to. Only paths inside the app.
export const takeReturnTo = () => {
  const path = take(RETURN_TO_KEY);
  return path?.startsWith("/") && !path.startsWith("//") ? path : null;
};

// Reads and forgets the search to run again.
export const takeSavedSearch = () => take(RESUME_SEARCH_KEY);
