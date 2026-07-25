import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MusicFilterDebugState } from '@/contexts/ProtectionContext';

function Row({ ok, label, sub, info }: { ok: boolean | 'info'; label: string; sub?: string; info?: boolean }) {
  const colors = useColors();
  const icon = ok === 'info' ? 'ℹ️' : ok ? '✅' : '❌';
  const labelColor = ok === 'info'
    ? colors.mutedForeground
    : ok ? colors.foreground : colors.mutedForeground;
  return (
    <View style={styles.row}>
      <Text style={{ fontSize: 13 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function MusicFilterDebugPanel({ state }: { state: MusicFilterDebugState }) {
  const colors = useColors();
  const { t } = useLanguage();

  const mediaFound = state.mediaFound > 0;
  const musicSignal = state.musicSignalDetected;
  const volumeActive = state.volumeReductionActive > 0;
  const eqActive = state.activeCount > 0;
  const corsBlocked = state.blockedCount > 0 && !eqActive;

  // "Unavailable" only when filter is on, media is found but neither the
  // primary (volume) nor secondary (EQ) layer is doing anything.
  const showUnavailable =
    state.enabled &&
    mediaFound &&
    !volumeActive &&
    !eqActive &&
    !musicSignal;

  const be = state.bandEnergy;
  const bassDeltaPct =
    be && be.bassBefore > 0
      ? Math.round(((be.bassBefore - be.bassAfter) / be.bassBefore) * 100)
      : null;
  const speechDeltaPct =
    be && be.speechBefore > 0
      ? Math.round(((be.speechAfter - be.speechBefore) / be.speechBefore) * 100)
      : null;

  return (
    <View style={[styles.panel, { backgroundColor: 'rgba(10,14,26,0.94)', borderColor: colors.border }]}>
      <Text style={styles.title}>{t('musicDebug.title')}</Text>

      {/* PRIMARY LAYER — always works, no CORS needed */}
      <Row
        ok={mediaFound}
        label={t('musicDebug.streamDetected')}
        sub={`${state.mediaFound} ${t('musicDebug.elementsFound')}`}
      />
      <Row
        ok={musicSignal}
        label={t('musicDebug.musicSignalDetected')}
        sub={t('musicDebug.musicSignalSub')}
      />
      <Row
        ok={volumeActive}
        label={t('musicDebug.volumeReductionActive')}
        sub={
          volumeActive
            ? `${state.volumeReductionActive} ${t('musicDebug.videosMuted')}`
            : t('musicDebug.noMusicSignalYet')
        }
      />

      {/* SECONDARY LAYER — CORS-dependent EQ */}
      <Row
        ok={eqActive ? true : corsBlocked ? 'info' : 'info'}
        label={t('musicDebug.deepAudioFilter')}
        sub={
          eqActive
            ? t('musicDebug.deepAudioActive')
            : corsBlocked
              ? t('musicDebug.deepAudioCorsBlocked')
              : t('musicDebug.deepAudioWaiting')
        }
      />

      {be && eqActive ? (
        <View style={[styles.bandBox, { borderColor: colors.border }]}>
          <Text style={styles.bandTitle}>{t('musicDebug.liveMeasurement')}</Text>
          <Text style={styles.bandLine}>
            {t('musicDebug.bassBand')}: {Math.round(be.bassBefore)} → {Math.round(be.bassAfter)}
            {bassDeltaPct !== null ? `  (${bassDeltaPct >= 0 ? '-' : '+'}${Math.abs(bassDeltaPct)}%)` : ''}
          </Text>
          <Text style={styles.bandLine}>
            {t('musicDebug.speechBand')}: {Math.round(be.speechBefore)} → {Math.round(be.speechAfter)}
            {speechDeltaPct !== null ? `  (${speechDeltaPct >= 0 ? '+' : ''}${speechDeltaPct}%)` : ''}
          </Text>
        </View>
      ) : null}

      {showUnavailable ? (
        <Text style={[styles.unavailable, { color: colors.warning }]}>
          {t('musicDebug.unavailableMessage')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  rowLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: 1 },
  bandBox: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 3,
  },
  bandTitle: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  bandLine: { color: '#c7cee6', fontSize: 11, fontFamily: 'Inter_400Regular' },
  unavailable: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 6,
  },
});
