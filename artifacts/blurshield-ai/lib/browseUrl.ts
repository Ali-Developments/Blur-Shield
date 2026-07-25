import { Platform } from 'react-native';
import type { PlatformId } from '@/contexts/ProtectionContext';
import { getBrowseBase } from '@/lib/apiBase';

const HOST_TO_PLATFORM: Record<string, PlatformId> = {
  'm.youtube.com':     'youtube',
  'www.youtube.com':   'youtube',
  'youtube.com':       'youtube',
  'www.tiktok.com':    'tiktok',
  'tiktok.com':        'tiktok',
  'www.instagram.com': 'instagram',
  'instagram.com':     'instagram',
  'm.facebook.com':    'facebook',
  'www.facebook.com':  'facebook',
  'facebook.com':      'facebook',
  'x.com':             'x',
  'twitter.com':       'x',
};

function browsePath(platform: PlatformId, pathname: string, search: string): string {
  return `/api/browse/${platform}${pathname}${search}`;
}

/** Rewrite a platform URL to load through the API browse proxy. */
export function toBrowseUrl(uri: string): string {
  try {
    const u = new URL(uri);
    const platform = HOST_TO_PLATFORM[u.hostname];
    if (!platform) return uri;

    const path = browsePath(platform, u.pathname, u.search);

    // Web without explicit API URL: same-origin relative path (Replit router).
    if (Platform.OS === 'web' && !process.env.EXPO_PUBLIC_API_URL) {
      return path;
    }

    return `${getBrowseBase()}/${platform}${u.pathname}${u.search}`;
  } catch {
    return uri;
  }
}
