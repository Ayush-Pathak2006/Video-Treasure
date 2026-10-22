import axios from 'axios';

// Backend URL for the current mode: Frontend/.env.development (npm run dev)
// or Frontend/.env.production (npm run build, used by Vercel).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const REFRESH_TOKEN_URL = '/api/v1/users/refresh-token';

// These answer 401 for their own reasons (wrong password, no session), so a 401 from them is final.
const NO_RETRY_URLS = ['/api/v1/users/login', REFRESH_TOKEN_URL, '/api/v1/users/logout'];

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Every refresh replaces the refresh token, so two refreshes at the same time would make the second
// one fail and log the user out. All callers share the one refresh that is in flight instead.
let refreshRequest = null;

export const refreshSession = () => {
  if (!refreshRequest) {
    refreshRequest = axiosInstance.post(REFRESH_TOKEN_URL, {}).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
};

// AppContext sets this to show the user as logged out when the session can't be renewed.
let handleSessionExpired = () => {};

export const setSessionExpiredHandler = handler => {
  handleSessionExpired = handler;
};

// Renews the session, or shows the user as logged out when it can't be renewed.
export const renewSession = async () => {
  try {
    return await refreshSession();
  } catch (error) {
    handleSessionExpired();
    throw error;
  }
};

// Public routes that treat logged-in visitors differently (search, video details) don't fail with 401 on an
// expired access token: they answer as for an anonymous visitor (`viewer: "anonymous"`). When the app has a user,
// renew the session once and ask again. If the session is gone (AppContext then shows the user as logged out),
// the anonymous answer stands.
export const requestAsViewer = async (request, { loggedIn }) => {
  const response = await request();

  if (!loggedIn || response.data.data.viewer !== 'anonymous') {
    return response;
  }

  try {
    await renewSession();
    return await request();
  } catch {
    return response;
  }
};

// The access token expires after 15 minutes. When a request gets a 401, renew the session
// with the refresh token cookie and send the same request once more.
axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    const request = error.config;
    const shouldRefresh =
      error.response?.status === 401 &&
      request &&
      !request.retriedAfterRefresh &&
      !NO_RETRY_URLS.includes(request.url);

    if (!shouldRefresh) {
      throw error;
    }

    request.retriedAfterRefresh = true;

    try {
      await renewSession();
    } catch {
      throw error;
    }

    return axiosInstance(request);
  },
);

export default axiosInstance;
