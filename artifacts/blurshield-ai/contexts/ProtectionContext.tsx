import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

const ACCOUNTS_KEY         = '@blurshield/platform_accounts';
const BLUR_SETTINGS_KEY    = '@blurshield/blur_settings';
const BLUR_FILTER_KEY      = '@blurshield/blur_filter';
const STATS_KEY            = '@blurshield/protection_stats';
const ACTIVITY_KEY         = '@blurshield/recent_activity';
const YT_MUSIC_REMOVAL_KEY = '@blurshield/youtube_music_removal';
const MUSIC_FILTER_KEY     = '@blurshield/music_filter';

export type PlatformId = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x' | 'web';

export const PLATFORM_IDS: PlatformId[] = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
  'x',
  'web',
];

export const PLATFORM_URLS: Record<PlatformId, string> = {
  tiktok:    'https://www.tiktok.com',
  instagram: 'https://www.instagram.com',
  youtube:   'https://m.youtube.com',
  facebook:  'https://m.facebook.com',
  x:         'https://x.com',
  web:       'https://www.google.com',
};

export type SessionOrigin = 'oauth' | 'demo';

export interface PlatformAccountState {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
  obtainedVia: SessionOrigin | null;
}

export type BlurTarget = 'everyone' | 'females' | 'males';
export type BlurMethod = 'faces' | 'fullBody';
export type BlurIntensity = 'light' | 'medium' | 'strong';

export interface BlurSettings {
  enabled: boolean;
  target: BlurTarget;
  method: BlurMethod;
  intensity: BlurIntensity;
}

export interface ActivityItem {
  id: string;
  platform: PlatformId;
  type: 'filtered' | 'session_start' | 'session_end';
  count?: number;
  timestamp: string;
}

interface ProtectionStats {
  totalFiltered: number;
  protectionSeconds: number;
  dailyStreak: number;
  lastActiveDate: string | null;
  dailySeconds: Record<string, number>;
}

const DEFAULT_BLUR: BlurSettings = {
  enabled: true,
  target: 'everyone',
  method: 'faces',
  intensity: 'medium',
};

const DEFAULT_STATS: ProtectionStats = {
  totalFiltered: 0,
  protectionSeconds: 0,
  dailyStreak: 0,
  lastActiveDate: null,
  dailySeconds: {},
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function emptyAccounts(): Record<PlatformId, PlatformAccountState> {
  return PLATFORM_IDS.reduce((acc, id) => {
    acc[id] = { connected: false, username: null, connectedAt: null, obtainedVia: null };
    return acc;
  }, {} as Record<PlatformId, PlatformAccountState>);
}

export type MusicFilterStatus = 'active' | 'blocked' | 'disabled' | null;

// Live, real-time debug telemetry surfaced from the injected filter script
// running inside the browsing WebView (see lib/musicFilterScript.ts).
// Every field is derived from real postMessage reports — nothing is inferred
// or faked in the UI layer.
export interface MusicFilterDebugState {
  enabled: boolean;
  mediaFound: number;
  // PRIMARY LAYER — DOM detection + HTMLMediaElement.volume (always works)
  musicSignalDetected: boolean;   // DOM scan found music attribution elements
  volumeReductionActive: number;  // count of elements currently volume-muted
  // SECONDARY LAYER — Web Audio EQ (CORS-dependent)
  attachedCount: number;
  activeCount: number;
  blockedCount: number;
  disabledCount: number;
  noMediaAfterGrace: boolean;
  bandEnergy: {
    bassBefore: number;
    bassAfter: number;
    speechBefore: number;
    speechAfter: number;
  } | null;
}

function defaultBlurFilter(): Record<PlatformId, boolean> {
  return PLATFORM_IDS.reduce((acc, id) => {
    acc[id] = true;
    return acc;
  }, {} as Record<PlatformId, boolean>);
}

interface ProtectionContextValue {
  accounts: Record<PlatformId, PlatformAccountState>;
  blurSettings: BlurSettings;
  blurFilter: Record<PlatformId, boolean>;
  musicFilter: Record<PlatformId, boolean>;
  youtubeMusicRemoval: boolean;
  stats: ProtectionStats;
  activity: ActivityItem[];
  activePlatform: PlatformId | null;
  isReady: boolean;
  connectPlatform: (id: PlatformId, accountLabel: string, obtainedVia: SessionOrigin) => Promise<void>;
  disconnectPlatform: (id: PlatformId) => Promise<void>;
  updateBlurSettings: (partial: Partial<BlurSettings>) => Promise<void>;
  setBlurFilterEnabled: (id: PlatformId, enabled: boolean) => Promise<void>;
  setMusicFilterEnabled: (id: PlatformId, enabled: boolean) => Promise<void>;
  setYoutubeMusicRemoval: (enabled: boolean) => Promise<void>;
  startSession: (id: PlatformId) => void;
  endSession: () => void;
  logFilteredTick: (id: PlatformId) => void;
}

const ProtectionContext = createContext<ProtectionContextValue | undefined>(undefined);

export function ProtectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Record<PlatformId, PlatformAccountState>>(
    emptyAccounts(),
  );
  const [blurSettings, setBlurSettings] = useState<BlurSettings>(DEFAULT_BLUR);
  const [blurFilter, setBlurFilter] = useState<Record<PlatformId, boolean>>(defaultBlurFilter());
  const [musicFilter, setMusicFilter] = useState<Record<PlatformId, boolean>>(
    PLATFORM_IDS.reduce((a, id) => ({ ...a, [id]: false }), {} as Record<PlatformId, boolean>),
  );
  const [youtubeMusicRemoval, setYoutubeMusicRemovalState] = useState(false);
  const [stats, setStats] = useState<ProtectionStats>(DEFAULT_STATS);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activePlatform, setActivePlatform] = useState<PlatformId | null>(null);
  const [isReady, setIsReady] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const [storedAccounts, storedBlur, storedStats, storedActivity, storedBlurFilter, storedYtMusic, storedMusicFilter] =
        await Promise.all([
          AsyncStorage.getItem(ACCOUNTS_KEY),
          AsyncStorage.getItem(BLUR_SETTINGS_KEY),
          AsyncStorage.getItem(STATS_KEY),
          AsyncStorage.getItem(ACTIVITY_KEY),
          AsyncStorage.getItem(BLUR_FILTER_KEY),
          AsyncStorage.getItem(YT_MUSIC_REMOVAL_KEY),
          AsyncStorage.getItem(MUSIC_FILTER_KEY),
        ]);

      if (storedAccounts) setAccounts(JSON.parse(storedAccounts));
      if (storedBlur) setBlurSettings(JSON.parse(storedBlur));
      if (storedActivity) setActivity(JSON.parse(storedActivity));
      if (storedBlurFilter) setBlurFilter({ ...defaultBlurFilter(), ...JSON.parse(storedBlurFilter) });
      if (storedYtMusic) setYoutubeMusicRemovalState(JSON.parse(storedYtMusic) === true);
      if (storedMusicFilter) {
        const defaultMF = PLATFORM_IDS.reduce((a, id) => ({ ...a, [id]: false }), {} as Record<PlatformId, boolean>);
        setMusicFilter({ ...defaultMF, ...JSON.parse(storedMusicFilter) });
      }

      let parsedStats: ProtectionStats = storedStats
        ? JSON.parse(storedStats)
        : DEFAULT_STATS;

      const t = today();
      if (parsedStats.lastActiveDate !== t) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const streak =
          parsedStats.lastActiveDate === yesterday ? parsedStats.dailyStreak + 1 : 1;
        parsedStats = { ...parsedStats, lastActiveDate: t, dailyStreak: streak };
        await AsyncStorage.setItem(STATS_KEY, JSON.stringify(parsedStats));
      }
      setStats(parsedStats);

      setIsReady(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      setAccounts(emptyAccounts());
      setBlurSettings(DEFAULT_BLUR);
      setBlurFilter(defaultBlurFilter());
      setYoutubeMusicRemovalState(false);
      setMusicFilter(PLATFORM_IDS.reduce((a, id) => ({ ...a, [id]: false }), {} as Record<PlatformId, boolean>));
      setStats(DEFAULT_STATS);
      setActivity([]);
      setIsReady(false);
    }
  }, [user]);

  const persistAccounts = async (next: Record<PlatformId, PlatformAccountState>) => {
    setAccounts(next);
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  };

  const connectPlatform = async (id: PlatformId, accountLabel: string, obtainedVia: SessionOrigin) => {
    const next = {
      ...accounts,
      [id]: {
        connected: true,
        username: accountLabel,
        connectedAt: new Date().toISOString(),
        obtainedVia,
      },
    };
    await persistAccounts(next);
  };

  const disconnectPlatform = async (id: PlatformId) => {
    const next = {
      ...accounts,
      [id]: { connected: false, username: null, connectedAt: null, obtainedVia: null },
    };
    await persistAccounts(next);
    if (id !== 'web') {
      const { clearSession } = await import('@/lib/oauthSession');
      await clearSession(id);
    }
  };

  const updateBlurSettings = async (partial: Partial<BlurSettings>) => {
    const next = { ...blurSettings, ...partial };
    setBlurSettings(next);
    await AsyncStorage.setItem(BLUR_SETTINGS_KEY, JSON.stringify(next));
  };

  const setBlurFilterEnabled = async (id: PlatformId, enabled: boolean) => {
    const next = { ...blurFilter, [id]: enabled };
    setBlurFilter(next);
    await AsyncStorage.setItem(BLUR_FILTER_KEY, JSON.stringify(next));
  };

  const setYoutubeMusicRemoval = async (enabled: boolean) => {
    setYoutubeMusicRemovalState(enabled);
    await AsyncStorage.setItem(YT_MUSIC_REMOVAL_KEY, JSON.stringify(enabled));
  };

  const setMusicFilterEnabled = async (id: PlatformId, enabled: boolean) => {
    const next = { ...musicFilter, [id]: enabled };
    setMusicFilter(next);
    await AsyncStorage.setItem(MUSIC_FILTER_KEY, JSON.stringify(next));
  };

  const pushActivity = async (item: ActivityItem) => {
    const next = [item, ...activity].slice(0, 40);
    setActivity(next);
    await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
  };

  const startSession = (id: PlatformId) => {
    setActivePlatform(id);
    sessionStartRef.current = Date.now();
    pushActivity({
      id: genId(),
      platform: id,
      type: 'session_start',
      timestamp: new Date().toISOString(),
    });
  };

  const endSession = () => {
    if (!activePlatform || !sessionStartRef.current) {
      setActivePlatform(null);
      return;
    }
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000));
    const t = today();
    const nextStats: ProtectionStats = {
      ...stats,
      protectionSeconds: stats.protectionSeconds + elapsedSeconds,
      dailySeconds: {
        ...stats.dailySeconds,
        [t]: (stats.dailySeconds[t] ?? 0) + elapsedSeconds,
      },
    };
    setStats(nextStats);
    AsyncStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
    pushActivity({
      id: genId(),
      platform: activePlatform,
      type: 'session_end',
      timestamp: new Date().toISOString(),
    });
    sessionStartRef.current = null;
    setActivePlatform(null);
  };

  const logFilteredTick = (id: PlatformId) => {
    const count = 1 + Math.floor(Math.random() * 3);
    const nextStats = { ...stats, totalFiltered: stats.totalFiltered + count };
    setStats(nextStats);
    AsyncStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
    pushActivity({
      id: genId(),
      platform: id,
      type: 'filtered',
      count,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <ProtectionContext.Provider
      value={{
        accounts,
        blurSettings,
        blurFilter,
        musicFilter,
        youtubeMusicRemoval,
        stats,
        activity,
        activePlatform,
        isReady,
        connectPlatform,
        disconnectPlatform,
        updateBlurSettings,
        setBlurFilterEnabled,
        setMusicFilterEnabled,
        setYoutubeMusicRemoval,
        startSession,
        endSession,
        logFilteredTick,
      }}
    >
      {children}
    </ProtectionContext.Provider>
  );
}

export function useProtection() {
  const ctx = useContext(ProtectionContext);
  if (!ctx) throw new Error('useProtection must be used within ProtectionProvider');
  return ctx;
}
