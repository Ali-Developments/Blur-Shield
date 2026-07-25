/**
 * Platform detail — browse any platform in an embedded WebView.
 *
 * YouTube only: AI Music Removal
 *   • expo-av Audio plays the clean track natively → background playback works
 *     even when the user closes/minimises the app.
 *   • Injected JS detects video play/pause/seek events and posts them back so
 *     the native player stays in sync with the WebView video.
 *   • The WebView video element is merely muted — it keeps playing for visual
 *     scrubbing; our Audio object carries the sound.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PlatformWebView as WebView,
  type PlatformWebViewRef,
  type WebViewMessageEvent,
} from '@/components/PlatformWebView';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { Feather, FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  PLATFORM_URLS,
  useProtection,
  type PlatformId,
} from '@/contexts/ProtectionContext';
import { OAUTH_PROVIDERS, type OAuthPlatformId } from '@/constants/oauthProviders';
import {
  getClientId,
  getDiscovery,
  getRedirectUri,
  isProviderConfigured,
  loadSession,
  saveSession,
  type PlatformSession,
} from '@/lib/oauthSession';
import { PLATFORM_META } from '@/components/PlatformCard';
import { GlassCard } from '@/components/GlassCard';
import { GradientButton } from '@/components/GradientButton';
import { ProtectionBadge } from '@/components/ProtectionBadge';
import { ConnectAccountCard } from '@/components/ConnectAccountCard';
import { ToggleRow } from '@/components/ToggleRow';
import {
  fetchGoogleProfile,
  fetchYouTubeChannel,
  isTokenExpired,
  refreshGoogleAccessToken,
} from '@/lib/googleApi';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { buildAIBlurJS, buildBlurUpdateJS, buildVocalFilterJS } from '@/lib/blurScript';
import { toBrowseUrl } from '@/lib/browseUrl';
import { resolvePublicUrl } from '@/lib/publicUrl';
import { buildMusicFilterJS } from '@/lib/musicFilterScript';
import { submitYoutubeJob, pollYoutubeJob, youtubeResultUrl, isYtJobActive } from '@/lib/youtubeMusicApi';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'checking' | 'connect' | 'demoLogin' | 'connected' | 'browsing';

export default function PlatformDetailScreen() {
  const colors       = useColors();
  const insets       = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { id }       = useLocalSearchParams<{ id: string }>();
  const platformId   = id as PlatformId;
  const meta         = PLATFORM_META[platformId];
  const label        = t(`platforms.${platformId}`);
  const isYoutube    = platformId === 'youtube';
  const isOAuthCapable = platformId !== 'web';

  const {
    accounts,
    blurSettings,
    blurFilter,
    musicFilter,
    setBlurFilterEnabled,
    youtubeMusicRemoval,
    setYoutubeMusicRemoval,
    connectPlatform,
    disconnectPlatform,
    startSession,
    endSession,
    logFilteredTick,
  } = useProtection();

  const blurFilterEnabled = blurFilter[platformId];
  const musicFilterEnabled = musicFilter[platformId];
  const youtubeAudioActive = isYoutube && (youtubeMusicRemoval || musicFilterEnabled);
  const platformMusicActive = !isYoutube && musicFilterEnabled;
  const account           = accounts[platformId];

  // ── Stage ──────────────────────────────────────────────────────────────────
  // Dev mode: always start in 'checking' then jump straight to 'browsing'.
  const [stage,          setStage]         = useState<Stage>('checking');
  const [session,        setSession]       = useState<PlatformSession | null>(null);
  const [authError,      setAuthError]     = useState<string | null>(null);
  const [isAuthorizing,  setIsAuthorizing] = useState(false);
  const [demoPageLoaded, setDemoPageLoaded]= useState(false);

  // ── YouTube music state ────────────────────────────────────────────────────
  // 'idle'      — filter off
  // 'activating'— injected, waiting for bs_audio_ready / bs_audio_error
  // 'active'    — Web Audio filter connected, music suppressed
  // 'error'     — connection failed (retry available)
  const [musicFilterState, setMusicFilterState] = useState<'idle' | 'activating' | 'active' | 'error'>('idle');
  const [currentPageUrl, setCurrentPageUrl] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const webviewRef = useRef<PlatformWebViewRef>(null);
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const processedSoundRef = useRef<Audio.Sound | null>(null);

  // ── OAuth ──────────────────────────────────────────────────────────────────
  const oAuthConfig = isOAuthCapable ? OAUTH_PROVIDERS[platformId as OAuthPlatformId] : null;
  const configured  = isOAuthCapable ? isProviderConfigured(platformId as OAuthPlatformId) : false;
  const safeOAuthPlatformId: OAuthPlatformId = isOAuthCapable
    ? (platformId as OAuthPlatformId)
    : 'tiktok';
  const redirectUri = getRedirectUri(safeOAuthPlatformId);
  const discovery   = isOAuthCapable
    ? getDiscovery(platformId as OAuthPlatformId)
    : getDiscovery('tiktok');
  const clientId    = isOAuthCapable ? getClientId(platformId as OAuthPlatformId) : undefined;

  // Generic OAuth hook — used for all non-Google platforms (TikTok, Instagram, Facebook, X).
  // Params are always well-formed (safe fallbacks for the non-OAuth 'web' platform) so
  // expo-auth-session never throws an Invariant Violation.
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId ?? 'demo-client-id',
      scopes:   oAuthConfig?.scopes ?? [],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:  oAuthConfig?.usePKCE ?? true,
    },
    discovery,
  );

  const googleConfigured =
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID) ||
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ||
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);

  // Provide empty-string fallbacks so Google.useAuthRequest always has valid
  // string inputs — the hook itself validates that each ID is a string.
  // If no client ID is configured, the hook just returns a non-usable request
  // (no redirectUri is built, no prompt is issued) — no invariant error.
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID     ?? '',
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID         ?? '',
    redirectUri:     Platform.OS === 'web' ? redirectUri : undefined,
    scopes: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    extraParams: {
      access_type: 'offline',
      prompt:      'select_account',
    },
  });

  // ── Auto-connect (dev / demo mode) ────────────────────────────────────────
  // Skip all OAuth gates — connect with a demo session immediately and go
  // straight to browsing so the Blur Protection feature can be tested
  // without any production credentials.
  useEffect(() => {
    (async () => {
      if (!accounts[platformId].connected) {
        const displayName = oAuthConfig?.name ?? label;
        await connectPlatform(platformId, displayName, 'demo');
      }
      startSession(platformId);
      setStage('browsing');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformId]);

  // ── OAuth response ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!oAuthConfig || !discovery || !configured) return;
    if (response?.type === 'success' && response.params.code) {
      (async () => {
        setIsAuthorizing(true); setAuthError(null);
        try {
          const tok = await AuthSession.exchangeCodeAsync(
            {
              clientId: clientId as string,
              code: response.params.code,
              redirectUri,
              extraParams: request?.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
            },
            discovery,
          );
          const ns: PlatformSession = {
            platform:     platformId as OAuthPlatformId,
            accountLabel: `${oAuthConfig.name} ${t('platformDetail.account')}`,
            obtainedVia:  'oauth',
            connectedAt:  new Date().toISOString(),
            expiresAt:    tok.expiresIn ? new Date(Date.now() + tok.expiresIn * 1000).toISOString() : null,
            accessToken:  tok.accessToken,
            refreshToken: tok.refreshToken,
            tokenType:    tok.tokenType ?? 'Bearer',
            scope:        tok.scope ?? oAuthConfig.scopes.join(' '),
          };
          await saveSession(ns);
          setSession(ns);
          await connectPlatform(platformId, ns.accountLabel, 'oauth');
          setStage('connected');
        } catch { setAuthError(t('platformDetail.connectionFailed')); }
        finally  { setIsAuthorizing(false); }
      })();
    } else if (response?.type === 'error') {
      setAuthError(t('platformDetail.connectionFailed')); setIsAuthorizing(false);
    } else if (response?.type === 'dismiss' || response?.type === 'cancel') {
      setIsAuthorizing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // ── Blur injection ─────────────────────────────────────────────────────────
  // Full AI init script — loads face-api.js + models on every page load.
  const blurInitJS = useMemo(
    () => {
      try { console.log('[Platform] buildAIBlurJS called'); } catch (e) {}
      const s = buildAIBlurJS(blurFilterEnabled, blurSettings.target, blurSettings.method, blurSettings.intensity);
      try { console.log('[Platform] blurInitJS length =', s ? s.length : 0); } catch (e) {}
      return s;
    },
    [blurFilterEnabled, blurSettings.target, blurSettings.method, blurSettings.intensity],
  );
  // Lightweight update — reconfigures the already-running AI without a model reload.
  const blurUpdateJS = useMemo(
    () => buildBlurUpdateJS(blurFilterEnabled, blurSettings.target, blurSettings.method, blurSettings.intensity),
    [blurFilterEnabled, blurSettings.target, blurSettings.method, blurSettings.intensity],
  );
  const musicFilterJS = useMemo(
    () => buildMusicFilterJS(platformMusicActive, platformId),
    [platformMusicActive, platformId],
  );
  const vocalFilterJS = useMemo(
    () => buildVocalFilterJS(youtubeAudioActive),
    [youtubeAudioActive],
  );

  const injectMusicScripts = useCallback(() => {
    if (isYoutube) {
      if (!youtubeAudioActive) return;
      webviewRef.current?.injectJavaScript(vocalFilterJS);
      setMusicFilterState('activating');
    } else if (platformMusicActive) {
      webviewRef.current?.injectJavaScript(musicFilterJS);
    }
  }, [isYoutube, vocalFilterJS, musicFilterJS, youtubeAudioActive, platformMusicActive]);

  const reapplyInjectedScripts = useCallback(() => {
    webviewRef.current?.injectJavaScript(blurInitJS);
    injectMusicScripts();
  }, [blurInitJS, injectMusicScripts]);
  // When settings change mid-session, reconfigure without re-loading models.
  // Always inject (including enabled:false) so Blur OFF fully tears down overlays/RAF.
  useEffect(() => {
    if (stage === 'browsing') {
      webviewRef.current?.injectJavaScript(blurUpdateJS);
    }
  }, [blurUpdateJS, stage]);

  useEffect(() => {
    if (stage !== 'browsing') return;
    injectMusicScripts();
  }, [stage, injectMusicScripts]);

  // ── Protection tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'browsing' && blurFilterEnabled) {
      tickRef.current = setInterval(() => logFilteredTick(platformId), 6000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, blurFilterEnabled, platformId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    (async () => {
      const currentSound = processedSoundRef.current;
      if (currentSound) {
        try { await currentSound.stopAsync(); } catch {}
        try { await currentSound.unloadAsync(); } catch {}
      }
      processedSoundRef.current = null;
    })();
    webviewRef.current?.injectJavaScript(buildVocalFilterJS(false));
    webviewRef.current?.injectJavaScript(buildMusicFilterJS(false, platformId));
  }, [platformId]);

  const stopProcessedAudio = useCallback(async () => {
    const currentSound = processedSoundRef.current;
    if (!currentSound) return;
    try { await currentSound.stopAsync(); } catch {}
    try { await currentSound.unloadAsync(); } catch {}
    processedSoundRef.current = null;
  }, []);

  const resolveCurrentPublicUrl = useCallback((url: string | null) => {
    return resolvePublicUrl(url, platformId, PLATFORM_URLS);
  }, [platformId]);

  // ── Music toggle: use the existing Demucs-backed YouTube pipeline ─────────
  const handleToggleYtMusic = useCallback(async (enabled: boolean) => {
    await setYoutubeMusicRemoval(enabled);
    if (!enabled) {
      await stopProcessedAudio();
      setMusicFilterState('idle');
      webviewRef.current?.injectJavaScript(buildVocalFilterJS(false));
      return;
    }

    const publicUrl = resolveCurrentPublicUrl(currentPageUrl);
    if (!publicUrl) {
      setMusicFilterState('error');
      return;
    }

    setMusicFilterState('activating');

    try {
      const jobId = await submitYoutubeJob(publicUrl);
      let jobStatus = await pollYoutubeJob(jobId);
      while (isYtJobActive(jobStatus.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        jobStatus = await pollYoutubeJob(jobId);
      }
      if (jobStatus.status !== 'completed' && jobStatus.status !== 'ready') {
        throw new Error(jobStatus.error || jobStatus.message || 'Music removal failed.');
      }

      await stopProcessedAudio();
      const resultUri = youtubeResultUrl(jobId);
      console.log('[Platform] createAsync input', { jobId, uri: resultUri, publicUrl });
      const { sound } = await Audio.Sound.createAsync(
        { uri: resultUri },
        { shouldPlay: false, isLooping: false, volume: 1.0 },
      );
      processedSoundRef.current = sound;

      const loadedStatus = await sound.getStatusAsync();
      if (!loadedStatus.isLoaded) {
        throw new Error('Replacement audio failed to load.');
      }

      console.log('[Platform] replacement audio ready', {
        uri: resultUri,
        loaded: loadedStatus.isLoaded,
        isPlaying: loadedStatus.isPlaying,
        durationMillis: loadedStatus.durationMillis,
        positionMillis: loadedStatus.positionMillis,
        volume: loadedStatus.volume,
        isBuffering: loadedStatus.isBuffering,
      });

      await sound.playAsync();
      const playbackStatus = await sound.getStatusAsync();
      if (!playbackStatus.isLoaded) {
        throw new Error('Replacement audio did not finish loading before playback.');
      }
      if (!playbackStatus.isPlaying) {
        console.warn('[Platform] replacement audio not playing after playAsync', playbackStatus);
      }

      console.log('[Platform] replacement audio playback', {
        uri: resultUri,
        loaded: playbackStatus.isLoaded,
        isPlaying: playbackStatus.isPlaying,
        didJustFinish: playbackStatus.didJustFinish,
        durationMillis: playbackStatus.durationMillis,
        positionMillis: playbackStatus.positionMillis,
        volume: playbackStatus.volume,
        isBuffering: playbackStatus.isBuffering,
      });

      webviewRef.current?.injectJavaScript(buildVocalFilterJS(true));
      setMusicFilterState('active');
    } catch (error) {
      console.error('[Platform] YouTube music removal failed', error);
      await stopProcessedAudio();
      webviewRef.current?.injectJavaScript(buildVocalFilterJS(false));
      setMusicFilterState('error');
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Music removal is unavailable right now. Browsing continues normally.';
      try {
        Alert.alert('Music Removal', message);
      } catch {}
    }
  }, [currentPageUrl, resolveCurrentPublicUrl, setYoutubeMusicRemoval, stopProcessedAudio]);

  // ── WebView message handler ─────────────────────────────────────────────────
  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.nativeEvent.data); }
    catch { return; }

    switch (msg.type as string) {
      // ── Web Audio filter connected successfully ─────────────────────────────
      case 'bs_audio_ready': {
        setMusicFilterState('active');
        break;
      }
      // ── Web Audio filter failed ─────────────────────────────────────────────
      case 'bs_audio_error': {
        setMusicFilterState('error');
        break;
      }
      // ── AI blur detected target content ────────────────────────────────────
      case 'bs_filtered': {
        logFilteredTick(platformId);
        break;
      }
      case 'bs_music_telemetry': {
        if (isYoutube) break;
        const stats = msg as {
          enabled?: boolean;
          musicSignalDetected?: boolean;
          volumeReductionActive?: number;
          activeCount?: number;
          blockedCount?: number;
        };
        if (stats.enabled === false) break;
        if ((stats.volumeReductionActive ?? 0) > 0 || stats.musicSignalDetected) {
          setMusicFilterState('active');
        } else if ((stats.blockedCount ?? 0) > 0 && (stats.activeCount ?? 0) === 0) {
          setMusicFilterState('error');
        }
        break;
      }
      case 'bs_lifecycle': {
        try { console.log('[Platform] bs_lifecycle:', (msg as any).event); } catch (e) {}
        break;
      }
    }
  }, [logFilteredTick, platformId, isYoutube]);

  // ── Auth helpers ───────────────────────────────────────────────────────────
  const handleContinue = useCallback(async () => {
    setAuthError(null);
    if (configured && request) { setIsAuthorizing(true); await promptAsync(); return; }
    setDemoPageLoaded(false); setStage('demoLogin');
  }, [configured, request, promptAsync]);

  const handleConfirmDemoLogin = useCallback(async () => {
    if (!oAuthConfig) return;
    const ns: PlatformSession = {
      platform:     platformId as OAuthPlatformId,
      accountLabel: `${oAuthConfig.name} ${t('platformDetail.account')}`,
      obtainedVia:  'demo',
      connectedAt:  new Date().toISOString(),
      expiresAt:    null,
      accessToken:  `demo-${genId()}`,
      tokenType:    'Demo',
      scope:        oAuthConfig.scopes.join(' '),
    };
    await saveSession(ns);
    setSession(ns);
    await connectPlatform(platformId, ns.accountLabel, 'demo');
    setStage('connected');
  }, [oAuthConfig, platformId, connectPlatform, t]);

  const handleDisconnect = () =>
    Alert.alert(
      t('platformDetail.disconnectConfirmTitle'),
      t('platformDetail.disconnectConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('platformDetail.disconnectAccount'), style: 'destructive',
          onPress: async () => {
            await disconnectPlatform(platformId);
            setSession(null);
            setStage(isOAuthCapable ? 'connect' : 'connected');
          },
        },
      ],
    );

  const handleStart = () => { setStage('browsing'); startSession(platformId); };

  const handleExit = () => {
    endSession();
    webviewRef.current?.injectJavaScript(buildVocalFilterJS(false));
    webviewRef.current?.injectJavaScript(buildMusicFilterJS(false, platformId));
    setMusicFilterState('idle');
    router.back();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ── Bottom music control bar (YouTube browsing only)
  // ─────────────────────────────────────────────────────────────────────────
  const musicBarStatus = (() => {
    if (!youtubeMusicRemoval)             return { text: t('youtubeMusic.barOff'),        color: colors.mutedForeground, spin: false };
    if (musicFilterState === 'activating') return { text: t('youtubeMusic.barQueued'),     color: colors.primary,        spin: true  };
    if (musicFilterState === 'active')     return { text: t('youtubeMusic.barActive'),     color: colors.success,        spin: false };
    if (musicFilterState === 'error')      return { text: t('youtubeMusic.barError'),      color: colors.warning,        spin: false };
    return { text: t('youtubeMusic.barWaiting'), color: colors.mutedForeground, spin: false };
  })();

  const YtMusicBar = () => {
    if (!isYoutube) return null;
    const isActive = musicFilterState === 'active';
    const isError  = musicFilterState === 'error';
    return (
      <View style={[
        styles.musicBar,
        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 },
      ]}>
        {/* Icon */}
        <View style={[
          styles.musicBarIcon,
          { backgroundColor: isActive ? `${colors.success}20` : `${colors.primary}15` },
        ]}>
          <Feather
            name="music"
            size={18}
            color={isActive ? colors.success : youtubeMusicRemoval ? colors.primary : colors.mutedForeground}
          />
        </View>

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.musicBarTitle, { color: colors.foreground }]}>
            {t('youtubeMusic.barLabel')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            {musicBarStatus.spin && (
              <ActivityIndicator size="small" color={musicBarStatus.color} style={{ transform: [{ scale: 0.6 }] }} />
            )}
            {!musicBarStatus.spin && isActive && (
              <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
            )}
            <Text style={[styles.musicBarStatus, { color: musicBarStatus.color }]} numberOfLines={1}>
              {musicBarStatus.text}
            </Text>
          </View>
        </View>

        {/* Retry button — shown on error */}
        {isError && (
          <Pressable
            onPress={() => {
              setMusicFilterState('activating');
              webviewRef.current?.injectJavaScript(buildVocalFilterJS(true));
            }}
            style={[styles.actionBtn, { borderColor: colors.warning }]}
          >
            <Feather name="refresh-cw" size={13} color={colors.warning} />
            <Text style={[styles.actionBtnText, { color: colors.warning }]}>{t('youtubeMusic.barRetry')}</Text>
          </Pressable>
        )}

        {/* Active badge */}
        {isActive && (
          <View style={[styles.bgBadge, { backgroundColor: `${colors.success}18`, borderColor: colors.success }]}>
            <Feather name="headphones" size={11} color={colors.success} />
            <Text style={[styles.bgBadgeText, { color: colors.success }]}>{t('youtubeMusic.bgBadge')}</Text>
          </View>
        )}

        {/* Toggle switch */}
        <Switch
          value={youtubeMusicRemoval}
          onValueChange={handleToggleYtMusic}
          trackColor={{ false: `${colors.border}`, true: `${colors.success}88` }}
          thumbColor={youtubeMusicRemoval ? colors.success : colors.mutedForeground}
          ios_backgroundColor={colors.muted}
        />
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render: demo login
  // ═══════════════════════════════════════════════════════════════════════════
  if (stage === 'demoLogin' && oAuthConfig) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.browseHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Pressable onPress={() => setStage('connect')} style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.browseTitle, { color: colors.foreground }]} numberOfLines={1}>
            {t('platformDetail.openLoginPage')}
          </Text>
        </View>
        <WebView source={{ uri: oAuthConfig.loginUrl }} style={{ flex: 1 }} onLoadEnd={() => setDemoPageLoaded(true)} startInLoadingState />
        <View style={[styles.confirmBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 14 }]}>
          <Text style={[styles.confirmHint, { color: colors.mutedForeground }]}>{t('platformDetail.confirmSignedInHint')}</Text>
          <GradientButton label={t('platformDetail.confirmSignedIn')} onPress={handleConfirmDemoLogin} disabled={!demoPageLoaded} />
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render: browsing
  // ═══════════════════════════════════════════════════════════════════════════
  if (stage === 'browsing') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={[styles.browseHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Pressable onPress={handleExit} style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>
          <View style={[styles.browseTitleWrap, isRTL && { alignItems: 'flex-end' }]}>
            <Text style={[styles.browseTitle, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
            <View style={[styles.liveRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.liveDot, { backgroundColor: blurFilterEnabled ? colors.primary : colors.mutedForeground }]} />
              <Text style={[styles.liveText, { color: blurFilterEnabled ? colors.primary : colors.mutedForeground }]}>
                {blurFilterEnabled ? t('platformDetail.blurLive') : t('platformDetail.blurOff')}
              </Text>
              {(platformMusicActive || youtubeAudioActive) && (
                <>
                  <Text style={[styles.liveText, { color: colors.mutedForeground }]}> · </Text>
                  <View style={[styles.liveDot, { backgroundColor: musicFilterState === 'active' ? colors.success : colors.accent }]} />
                  <Text style={[styles.liveText, { color: musicFilterState === 'active' ? colors.success : colors.accent }]}>
                    {musicFilterState === 'active'
                      ? t('platforms.musicFilterActiveLive')
                      : musicFilterState === 'error'
                        ? t('platforms.musicFilterBlockedLive')
                        : t('platforms.musicFilterScanning')}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── WebView ───────────────────────────────────────────────────── */}
        <WebView
          ref={webviewRef}
          source={{ uri: toBrowseUrl(PLATFORM_URLS[platformId]) }}
          style={{ flex: 1 }}
          onLoadEnd={() => {
              try { console.log('[Platform] onLoadEnd fired'); } catch (e) {}
              setTimeout(() => {
                if (stage !== 'browsing') return;
                try { console.log('[Platform] calling webviewRef.current.injectJavaScript for blurInitJS'); } catch (e) {}
                try { reapplyInjectedScripts(); console.log('[Platform] injectJavaScript(blurInitJS) returned'); } catch (injE) { console.error('[Platform] injectJavaScript(blurInitJS) threw', injE); }
              }, 1000);
          }}
          onNavigationStateChange={(navState) => {
            if (navState.url) {
              setCurrentPageUrl(navState.url);
            }
            if (stage === 'browsing' && navState.url) {
              setTimeout(() => {
                try { reapplyInjectedScripts(); } catch (injE) { console.error('[Platform] navigation re-inject failed', injE); }
              }, 250);
            }
          }}
          injectedJavaScript={undefined}
          onMessage={handleWebViewMessage}
          startInLoadingState
          allowsBackForwardNavigationGestures
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
        />

        {/* ── YouTube bottom music control bar ─────────────────────────── */}
        <YtMusicBar />

      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render: pre-browse (connect / connected)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
        <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.muted, marginBottom: 20 }]}>
          <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color={colors.foreground} />
        </Pressable>

        <LinearGradient colors={[meta.color, `${meta.color}CC`]} style={styles.hero}>
          <FontAwesome6 name={meta.icon} size={32} color="#FFFFFF" />
        </LinearGradient>
        <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
        <ProtectionBadge
          active={account.connected}
          activeLabel={t('platforms.protectionOn')}
          inactiveLabel={t('platforms.protectionOff')}
        />

        {stage === 'checking' ? (
          <View style={{ marginTop: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
        ) : account.connected ? (
          <GlassCard style={{ marginTop: 20, gap: 0 }}>
            {/* Account row — shows real avatar + channel name for Google accounts */}
            <View style={[styles.accountRow, isRTL && { flexDirection: 'row-reverse' }]}>
              {session?.avatarUrl ? (
                <Image source={{ uri: session.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: `${meta.color}33` }]}>
                  <FontAwesome6 name={meta.icon} size={16} color={meta.color} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{t('platformDetail.signedInAs')}</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={1}>{account.username}</Text>
                <View style={[styles.viaRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Feather name={account.obtainedVia === 'oauth' ? 'shield' : 'info'} size={12} color={account.obtainedVia === 'oauth' ? colors.success : colors.warning} />
                  <Text style={[styles.viaText, { color: account.obtainedVia === 'oauth' ? colors.success : colors.warning }]}>
                    {account.obtainedVia === 'oauth' ? t('platformDetail.sessionViaOAuth') : t('platformDetail.sessionViaDemo')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <ToggleRow
              icon={<Feather name="eye-off" size={17} color={blurFilterEnabled ? colors.primary : colors.mutedForeground} />}
              title={t('platforms.blurFilterTitle')}
              subtitle={blurFilterEnabled ? t('platforms.blurFilterActive') : t('platforms.blurFilterDisabled')}
              value={blurFilterEnabled}
              onValueChange={v => setBlurFilterEnabled(platformId, v)}
            />

            {isYoutube && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <ToggleRow
                  icon={<Feather name="music" size={17} color={youtubeMusicRemoval ? colors.success : colors.mutedForeground} />}
                  title={t('youtubeMusic.toggleTitle')}
                  subtitle={youtubeMusicRemoval ? t('youtubeMusic.toggleActiveSubtitle') : t('youtubeMusic.toggleSubtitle')}
                  value={youtubeMusicRemoval}
                  onValueChange={handleToggleYtMusic}
                />
                {youtubeMusicRemoval && (
                  <View style={[styles.ytInfoBox, { borderColor: colors.border }]}>
                    <Feather name="headphones" size={13} color={colors.success} />
                    <Text style={[styles.ytInfoText, { color: colors.mutedForeground }]}>
                      {t('youtubeMusic.infoNote')}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={{ paddingTop: 6, gap: 10 }}>
              <GradientButton label={t('platformDetail.startBrowsing')} onPress={handleStart} icon={<Feather name="play" size={16} color="#FFFFFF" />} />
              <GradientButton label={t('platformDetail.disconnectAccount')} variant="outline" onPress={handleDisconnect} />
            </View>
          </GlassCard>
        ) : isOAuthCapable && oAuthConfig ? (
          <View style={{ marginTop: 20 }}>
            <ConnectAccountCard meta={meta} config={oAuthConfig} isConfigured={configured} isAuthorizing={isAuthorizing} error={authError} onContinue={handleContinue} />
          </View>
        ) : (
          <GlassCard style={{ marginTop: 20, gap: 14 }}>
            <GradientButton
              label={t('platformDetail.startBrowsing')}
              onPress={() => { connectPlatform(platformId, t('platforms.web'), 'demo'); handleStart(); }}
              icon={<Feather name="play" size={16} color="#FFFFFF" />}
            />
          </GlassCard>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  iconBtn:           { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hero:              { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:             { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  // Account row (connected card)
  accountRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 2 },
  avatar:            { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  metaLabel:         { fontSize: 12.5, fontFamily: 'Inter_500Medium', marginBottom: 3 },
  metaValue:         { fontSize: 15,   fontFamily: 'Inter_600SemiBold' },
  viaRow:            { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  viaText:           { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
  divider:           { height: 1 },
  ytInfoBox:       { flexDirection: 'row', gap: 8, padding: 10, borderWidth: 1, borderRadius: 10, marginTop: 4, alignItems: 'flex-start' },
  ytInfoText:      { flex: 1, fontSize: 11.5, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  // Browsing header
  browseHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  browseTitleWrap: { flex: 1 },
  browseTitle:     { fontSize: 15.5, fontFamily: 'Inter_700Bold' },
  liveRow:         { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveDot:         { width: 6, height: 6, borderRadius: 3 },
  liveText:        { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  // Music bottom bar
  musicBar:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  musicBarIcon:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  musicBarTitle:   { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  musicBarStatus:  { fontSize: 11.5, fontFamily: 'Inter_400Regular' },
  activeDot:       { width: 6, height: 6, borderRadius: 3 },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderRadius: 20 },
  actionBtnText:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  progressPct:     { fontSize: 13, fontFamily: 'Inter_700Bold', minWidth: 36, textAlign: 'center' },
  bgBadge:         { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: 20 },
  bgBadgeText:     { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  // Demo login
  confirmBar:      { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  confirmHint:     { fontSize: 12.5, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  // Paste modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:       { width: '100%', borderRadius: 20, padding: 20, gap: 12 },
  modalTitle:      { fontSize: 17, fontFamily: 'Inter_700Bold' },
  modalSubtitle:   { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  modalInput:      { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Inter_400Regular' },
  modalError:      { fontSize: 12.5, fontFamily: 'Inter_500Medium' },
});
