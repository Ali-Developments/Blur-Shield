import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { OAUTH_PROVIDERS, type OAuthPlatformId } from '@/constants/oauthProviders';

const APP_SCHEME = 'blurshield-ai';

const tokenStore = {
  async getItem(key: string) {
    return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    return Platform.OS === 'web'
      ? AsyncStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    return Platform.OS === 'web'
      ? AsyncStorage.removeItem(key)
      : SecureStore.deleteItemAsync(key);
  },
};

export type SessionOrigin = 'oauth' | 'demo';

export interface PlatformSession {
  platform:     OAuthPlatformId;
  accountLabel: string;
  avatarUrl?:   string;
  obtainedVia:  SessionOrigin;
  connectedAt:  string;
  expiresAt:    string | null;
  accessToken:  string;
  refreshToken?: string;
  tokenType:    string;
  scope:        string;
}

function sessionKey(platform: OAuthPlatformId): string {
  return `blurshield_oauth_session_v2_${platform}`;
}

export async function saveSession(session: PlatformSession): Promise<void> {
  await tokenStore.setItem(sessionKey(session.platform), JSON.stringify(session));
}

export async function loadSession(platform: OAuthPlatformId): Promise<PlatformSession | null> {
  const raw = await tokenStore.getItem(sessionKey(platform));
  return raw ? (JSON.parse(raw) as PlatformSession) : null;
}

export async function clearSession(platform: OAuthPlatformId): Promise<void> {
  await tokenStore.removeItem(sessionKey(platform));
}

export function getClientId(platform: OAuthPlatformId): string | undefined {
  if (platform === 'youtube') {
    const iosId     = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'];
    const androidId = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'];
    const webId     = (process.env as Record<string, string | undefined>)['EXPO_PUBLIC_GOOGLE_CLIENT_ID'];
    if (Platform.OS === 'ios'     && iosId)     return iosId;
    if (Platform.OS === 'android' && androidId) return androidId;
    return webId && webId.length > 0 ? webId : undefined;
  }
  const envVar = OAUTH_PROVIDERS[platform].clientIdEnvVar;
  const value  = (process.env as Record<string, string | undefined>)[envVar];
  return value && value.length > 0 ? value : undefined;
}

export function isProviderConfigured(platform: OAuthPlatformId): boolean {
  return Boolean(getClientId(platform));
}

function fallbackWebRedirectUri(platform: OAuthPlatformId): string {
  const scheme = APP_SCHEME;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { origin } = window.location;
    return `${origin}/oauth/${platform}`;
  }
  try {
    const expoOrigin = Constants.expoConfig?.extra?.router?.origin
      ?? Constants.expoConfig?.hostUri
      ?? Constants.manifest?.extra?.expoGo?.projectUrlForQRCode;
    if (expoOrigin) {
      return `${expoOrigin.replace(/\/+$/, '')}/${scheme}/oauth/${platform}`;
    }
  } catch {}
  return `${scheme}:/oauth/${platform}`;
}

export function getRedirectUri(platform: OAuthPlatformId): string {
  try {
    const uri = AuthSession.makeRedirectUri({
      scheme: APP_SCHEME,
      path: `oauth/${platform}`,
      preferLocalhost: true,
    });
    if (uri && uri.length > 0 && uri !== APP_SCHEME + ':/') {
      return uri;
    }
  } catch (e) {
    console.warn('[oauthSession] makeRedirectUri failed, using fallback:', e);
  }
  return fallbackWebRedirectUri(platform);
}

export function getDiscovery(platform: OAuthPlatformId): AuthSession.DiscoveryDocument {
  const config = OAUTH_PROVIDERS[platform];
  return {
    authorizationEndpoint: config.authorizationEndpoint,
    tokenEndpoint:         config.tokenEndpoint,
    revocationEndpoint:    config.revocationEndpoint,
  };
}
