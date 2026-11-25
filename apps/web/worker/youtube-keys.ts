/** Pinned: the refresh and code exchange never go anywhere else. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const YT_ACCESS_KEY = "yt:access";
export const YT_REFRESH_KEY = "yt:refresh";
/** SHA-256 of the Worker-secret refresh token `yt:refresh` was rotated from. */
export const YT_REFRESH_BASE_KEY = "yt:refresh-base";
export const YT_STATUS_KEY = "yt:status";
/** Ms when the one-click flow stored `yt:refresh`. Absent: age unknown. */
export const YT_MINTED_KEY = "yt:minted";
/** OAuth client id that minted `yt:refresh` (a refresh token only works with it). */
export const YT_CLIENT_KEY = "yt:client";
export const YOUTUBE_TOKEN_ALERT_KEY = "youtube-token-invalid";
