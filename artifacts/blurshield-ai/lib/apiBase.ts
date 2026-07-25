import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '3000';

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

function hostFromExpoDev(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ??
    (Constants as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;
  return hostUri.split(':')[0] || null;
}

function apiOriginFromHost(host: string): string {
  return `http://${host}:${API_PORT}`;
}

/**
 * Origin of the API server (no trailing slash).
 *
 * Resolution order:
 *  1. EXPO_PUBLIC_API_URL when it is not a localhost URL on a remote host (Replit)
 *  2. Expo dev host (LAN / emulator)
 *  3. Same origin on web (Replit / production)
 *  4. Android emulator loopback / localhost fallback
 */
export function getApiOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  const devHost = hostFromExpoDev();

  // On Replit / remote web hosts, a baked-in localhost URL would point at the
  // user's device instead of the server — ignore it and use same-origin.
  const onRemoteWeb =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!window.location?.hostname &&
    !isLocalDevHost(window.location.hostname);

  if (configured) {
    try {
      const cfgHost = new URL(configured).hostname;
      const configuredIsLocal = isLocalDevHost(cfgHost);
      if (configuredIsLocal && Platform.OS === 'android' && devHost && !isLocalDevHost(devHost)) {
        return apiOriginFromHost(devHost);
      }
      if (!(onRemoteWeb && configuredIsLocal)) {
        return configured;
      }
    } catch {
      if (!onRemoteWeb) return configured;
    }
  }

  if (devHost) {
    if (Platform.OS === 'android' && (devHost === 'localhost' || devHost === '127.0.0.1')) {
      if (!Constants.isDevice) {
        return `http://10.0.2.2:${API_PORT}`;
      }
      // Physical Android devices cannot reach the desktop via localhost.
      // Use an explicit configured API URL if provided.
      if (configured) {
        console.warn(
          '[apiBase] Physical Android device detected; using EXPO_PUBLIC_API_URL instead of localhost',
          configured,
        );
        return configured;
      }
      console.warn(
        '[apiBase] Physical Android device detected but no EXPO_PUBLIC_API_URL is configured. ' +
        'Set EXPO_PUBLIC_API_URL to your machine LAN IP so the app can reach the backend.',
      );
      return `http://localhost:${API_PORT}`;
    }
    return apiOriginFromHost(devHost);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, port, origin } = window.location;
    if (port && port !== API_PORT && isLocalDevHost(hostname)) {
      return `http://${hostname}:${API_PORT}`;
    }
    return origin;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export function getBrowseBase(): string {
  return `${getApiOrigin()}/api/browse`;
}
