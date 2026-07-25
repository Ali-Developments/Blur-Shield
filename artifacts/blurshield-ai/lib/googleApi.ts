/**
 * Google / YouTube API helpers.
 *
 * All calls are authenticated with the OAuth 2.0 Bearer token obtained
 * from `expo-auth-session/providers/google`.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleProfile {
  sub:     string;   // Google user ID
  name:    string;
  email:   string;
  picture: string;   // HTTPS URL of the profile photo
}

export interface YouTubeChannel {
  channelId:       string;
  channelTitle:    string;
  thumbnailUrl:    string;
  subscriberCount: string;
  videoCount:      string;
}

export interface RefreshedTokens {
  accessToken: string;
  expiresAt:   string;   // ISO timestamp
}

// ─── Google OAuth token endpoints ────────────────────────────────────────────

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Fetch the signed-in Google user's basic profile (name, email, avatar).
 * Requires at minimum the `profile` + `email` scopes.
 */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google profile fetch failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<GoogleProfile>;
}

// ─── YouTube channel ──────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's primary YouTube channel.
 * Requires the `https://www.googleapis.com/auth/youtube.readonly` scope.
 * Returns null if the account has no YouTube channel.
 */
export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const url =
    'https://www.googleapis.com/youtube/v3/channels' +
    '?part=snippet,statistics&mine=true&maxResults=1';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const data = await res.json() as { items?: Array<{
    id: string;
    snippet: { title: string; thumbnails?: { default?: { url: string } } };
    statistics: { subscriberCount?: string; videoCount?: string };
  }> };

  const ch = data.items?.[0];
  if (!ch) return null;

  return {
    channelId:       ch.id,
    channelTitle:    ch.snippet.title,
    thumbnailUrl:    ch.snippet.thumbnails?.default?.url ?? '',
    subscriberCount: ch.statistics.subscriberCount ?? '0',
    videoCount:      ch.statistics.videoCount ?? '0',
  };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Exchange a refresh_token for a new access_token.
 *
 * Works with PKCE-issued tokens (no client_secret needed — pass the same
 * client_id that was used for the initial authorization).
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt:   new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/**
 * Returns true if the access token has expired (or will expire within 60 s).
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return Date.now() >= new Date(expiresAt).getTime() - 60_000;
}
