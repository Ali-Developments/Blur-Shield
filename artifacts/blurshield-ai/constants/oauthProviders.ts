import type { PlatformId } from '@/contexts/ProtectionContext';

export type OAuthPlatformId = Exclude<PlatformId, 'web'>;

export interface OAuthProviderConfig {
  /** Display name used in "Continue with {name}" copy. */
  name: string;
  /**
   * Name of the EXPO_PUBLIC_* env var a developer sets to activate real OAuth.
   * For YouTube/Google, this is the *web* client ID; platform-native client
   * IDs are in separate env vars (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, etc.).
   */
  clientIdEnvVar: string;
  /** Real, publicly documented authorization endpoint. */
  authorizationEndpoint: string;
  /** Real, publicly documented token endpoint. */
  tokenEndpoint: string;
  /** Token revocation endpoint (used on disconnect). */
  revocationEndpoint?: string;
  /** OAuth 2.0 scopes requested. Shown to the user before they continue. */
  scopes: string[];
  /** Whether PKCE is used (no client_secret required on the mobile client). */
  usePKCE: boolean;
  /** Mobile login page opened inside the app for the demo-session fallback. */
  loginUrl: string;
}

/**
 * OAuth 2.0 configuration for each supported platform.
 *
 * ── Google / YouTube ───────────────────────────────────────────────────────
 * Three client IDs are required for full production coverage:
 *
 *   EXPO_PUBLIC_GOOGLE_CLIENT_ID          – Web application client ID
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID      – iOS native client ID
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  – Android native client ID
 *
 * How to obtain them (Google Cloud Console):
 *   1. Go to https://console.cloud.google.com → APIs & Services → Credentials.
 *   2. Enable "YouTube Data API v3" under Enabled APIs & Services.
 *   3. Create OAuth 2.0 Client ID for each platform:
 *
 *      Web application:
 *        • Authorized JavaScript origins: https://auth.expo.io
 *        • Authorized redirect URIs:
 *            https://auth.expo.io/@<your-expo-username>/blurshield-ai
 *            (used by Expo Go during development)
 *
 *      iOS:
 *        • Bundle ID: com.blurshield.app
 *        • No redirect URI needed — Google uses the reverse client ID scheme.
 *
 *      Android:
 *        • Package name: com.blurshield.app
 *        • SHA-1 certificate fingerprint of your signing key.
 *          For development: run `keytool -list -v -keystore ~/.android/debug.keystore`
 *          For production: use your release keystore.
 *        • No redirect URI needed — Google uses the package name scheme.
 *
 *   4. Add all three Client IDs as Replit Secrets:
 *        EXPO_PUBLIC_GOOGLE_CLIENT_ID          = Web client ID
 *        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID      = iOS client ID
 *        EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  = Android client ID
 *
 * ── Other platforms ────────────────────────────────────────────────────────
 * Each requires registering a developer app with that company.  Once the
 * client ID env var is present, `useAuthRequest` automatically switches from
 * demo mode to a real Authorization Code + PKCE exchange — no other code
 * changes required.
 */
export const OAUTH_PROVIDERS: Record<OAuthPlatformId, OAuthProviderConfig> = {
  tiktok: {
    name:                  'TikTok',
    clientIdEnvVar:        'EXPO_PUBLIC_TIKTOK_CLIENT_KEY',
    authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenEndpoint:         'https://open.tiktokapis.com/v2/oauth/token/',
    scopes:                ['user.info.basic'],
    usePKCE:               true,
    loginUrl:              'https://www.tiktok.com/login',
  },
  instagram: {
    name:                  'Instagram',
    clientIdEnvVar:        'EXPO_PUBLIC_INSTAGRAM_CLIENT_ID',
    authorizationEndpoint: 'https://api.instagram.com/oauth/authorize',
    tokenEndpoint:         'https://api.instagram.com/oauth/access_token',
    scopes:                ['user_profile'],
    usePKCE:               false,
    loginUrl:              'https://www.instagram.com/accounts/login/',
  },
  youtube: {
    name:                  'Google',
    clientIdEnvVar:        'EXPO_PUBLIC_GOOGLE_CLIENT_ID',   // web fallback
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint:         'https://oauth2.googleapis.com/token',
    revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
    scopes: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    usePKCE:  true,
    loginUrl: 'https://m.youtube.com',
  },
  facebook: {
    name:                  'Facebook',
    clientIdEnvVar:        'EXPO_PUBLIC_FACEBOOK_APP_ID',
    authorizationEndpoint: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenEndpoint:         'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes:                ['public_profile'],
    usePKCE:               false,
    loginUrl:              'https://m.facebook.com/login/',
  },
  x: {
    name:                  'X',
    clientIdEnvVar:        'EXPO_PUBLIC_X_CLIENT_ID',
    authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
    tokenEndpoint:         'https://api.twitter.com/2/oauth2/token',
    scopes:                ['users.read', 'tweet.read'],
    usePKCE:               true,
    loginUrl:              'https://x.com/i/flow/login',
  },
};
