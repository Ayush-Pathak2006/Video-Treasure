export const DB_NAME = "video_treasure_db";

// Options for the accessToken/refreshToken cookies. The frontend (Vercel) and backend (Render) are on
// different sites, so cookies must be SameSite=None + Secure. Clearing a cookie needs these same options,
// otherwise the browser ignores the clear, so always use this constant for both.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
};