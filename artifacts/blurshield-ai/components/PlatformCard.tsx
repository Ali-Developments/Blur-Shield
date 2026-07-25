import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather, FontAwesome6 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { GlassCard } from '@/components/GlassCard';
import type { PlatformId } from '@/contexts/ProtectionContext';

export const PLATFORM_META: Record<
  PlatformId,
  { icon: React.ComponentProps<typeof FontAwesome6>['name']; color: string }
> = {
  tiktok:    { icon: 'tiktok',    color: '#EE1D52' },
  instagram: { icon: 'instagram', color: '#C13584' },
  youtube:   { icon: 'youtube',   color: '#FF0000' },
  facebook:  { icon: 'facebook',  color: '#1877F2' },
  x:         { icon: 'x-twitter', color: '#0F1419' },
  web:       { icon: 'globe',     color: '#2563EB' },
};

export function PlatformCard({
  id,
  label,
  connected,
  username,
  blurFilterEnabled,
  musicFilterEnabled,
  onToggleBlurFilter,
  onToggleMusicFilter,
  onPress,
}: {
  id: PlatformId;
  label: string;
  connected: boolean;
  username?: string | null;
  blurFilterEnabled: boolean;
  musicFilterEnabled: boolean;
  onToggleBlurFilter: (enabled: boolean) => void;
  onToggleMusicFilter: (enabled: boolean) => void;
  onPress: () => void;
}) {
  const colors = useColors();
  const { isRTL, t } = useLanguage();
  const meta = PLATFORM_META[id];

  return (
    <GlassCard style={styles.card}>
      {/* Platform header row — tappable to open the browser */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
      >
        {({ pressed }) => (
          <View style={[styles.headerRow, isRTL && { flexDirection: 'row-reverse' }, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${meta.color}22` }]}>
              <FontAwesome6 name={meta.icon} size={20} color={meta.color} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
                <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {connected ? username || t('platforms.connected') : t('platforms.notConnected')}
                </Text>
              </View>
            </View>
            <Feather
              name={isRTL ? 'chevron-left' : 'chevron-right'}
              size={18}
              color={colors.mutedForeground}
            />
          </View>
        )}
      </Pressable>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Dual toggle row */}
      <View style={[styles.togglesRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {/* Music toggle */}
        <View style={styles.toggleItem}>
          <View style={[styles.toggleIconWrap, { backgroundColor: musicFilterEnabled ? `${colors.accent}22` : colors.muted }]}>
            <Feather name="music" size={14} color={musicFilterEnabled ? colors.accent : colors.mutedForeground} />
          </View>
          <View style={styles.toggleTextWrap}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('platforms.musicFilterTitle')}</Text>
            <Text style={[styles.toggleSub, { color: musicFilterEnabled ? colors.accent : colors.mutedForeground }]}>
              {musicFilterEnabled ? t('common.on') : t('common.off')}
            </Text>
          </View>
          <Switch
            value={musicFilterEnabled}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleMusicFilter(v);
            }}
            trackColor={{ false: colors.border, true: `${colors.accent}55` }}
            thumbColor={musicFilterEnabled ? colors.accent : colors.mutedForeground}
            ios_backgroundColor={colors.border}
            style={styles.switch}
          />
        </View>

        <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />

        {/* Blur toggle */}
        <View style={styles.toggleItem}>
          <View style={[styles.toggleIconWrap, { backgroundColor: blurFilterEnabled ? `${colors.primary}22` : colors.muted }]}>
            <Feather name="eye-off" size={14} color={blurFilterEnabled ? colors.primary : colors.mutedForeground} />
          </View>
          <View style={styles.toggleTextWrap}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('platforms.blurFilterTitle')}</Text>
            <Text style={[styles.toggleSub, { color: blurFilterEnabled ? colors.primary : colors.mutedForeground }]}>
              {blurFilterEnabled ? t('common.on') : t('common.off')}
            </Text>
          </View>
          <Switch
            value={blurFilterEnabled}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleBlurFilter(v);
            }}
            trackColor={{ false: colors.border, true: `${colors.primary}55` }}
            thumbColor={blurFilterEnabled ? colors.primary : colors.mutedForeground}
            ios_backgroundColor={colors.border}
            style={styles.switch}
          />
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card:         { gap: 12, paddingVertical: 14 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:     { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textWrap:     { flex: 1, gap: 3 },
  label:        { fontSize: 15.5, fontFamily: 'Inter_600SemiBold' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  sub:          { fontSize: 12, fontFamily: 'Inter_400Regular' },
  divider:      { height: StyleSheet.hairlineWidth, marginHorizontal: -2 },
  togglesRow:   { flexDirection: 'row', gap: 0 },
  toggleItem:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleDivider:{ width: StyleSheet.hairlineWidth, marginVertical: 2, alignSelf: 'stretch' },
  toggleIconWrap:{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleTextWrap:{ flex: 1, gap: 1 },
  toggleLabel:  { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
  toggleSub:    { fontSize: 10.5, fontFamily: 'Inter_400Regular' },
  switch:       { transform: [{ scaleX: 0.78 }, { scaleY: 0.78 }] },
});
