import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProtection } from '@/contexts/ProtectionContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';
import { ToggleRow } from '@/components/ToggleRow';
import { SegmentedControl } from '@/components/SegmentedControl';
import { BlurPreview } from '@/components/BlurPreview';

export default function BlurSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { blurSettings, updateBlurSettings } = useProtection();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('blur.title')} />
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('blur.subtitle')}</Text>

        {/* Master toggle */}
        <GlassCard style={{ marginBottom: 20 }}>
          <ToggleRow
            title={t('blur.masterToggle')}
            subtitle={t('blur.masterToggleBody')}
            value={blurSettings.enabled}
            onValueChange={(enabled) => updateBlurSettings({ enabled })}
            icon={<Feather name="shield" size={18} color={colors.primary} />}
          />
        </GlassCard>

        {/* Blur target */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{t('blur.target')}</Text>
        <SegmentedControl
          options={[
            { value: 'everyone', label: t('blur.everyone') },
            { value: 'females',  label: t('blur.females')  },
            { value: 'males',    label: t('blur.males')    },
          ]}
          value={blurSettings.target}
          onChange={(target) => updateBlurSettings({ target })}
        />

        {/* Blur method */}
        <Text style={[styles.sectionLabel, { color: colors.foreground, marginTop: 20 }]}>
          {t('blur.method')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'faces',    label: t('blur.faces')    },
            { value: 'fullBody', label: t('blur.fullBody') },
          ]}
          value={blurSettings.method}
          onChange={(method) => updateBlurSettings({ method })}
        />

        {/* Blur intensity */}
        <Text style={[styles.sectionLabel, { color: colors.foreground, marginTop: 20 }]}>
          {t('blur.intensity')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'light',  label: t('blur.light')  },
            { value: 'medium', label: t('blur.medium') },
            { value: 'strong', label: t('blur.strong') },
          ]}
          value={blurSettings.intensity}
          onChange={(intensity) => updateBlurSettings({ intensity })}
        />

        {/* Live preview */}
        <View style={styles.previewHeader}>
          <Text style={[styles.sectionLabel, { color: colors.foreground, marginBottom: 0 }]}>
            {t('blur.preview')}
          </Text>
          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: blurSettings.enabled ? `${colors.success}22` : `${colors.mutedForeground}18` }]}>
            <View style={[styles.statusDot, { backgroundColor: blurSettings.enabled ? colors.success : colors.mutedForeground }]} />
            <Text style={[styles.statusText, { color: blurSettings.enabled ? colors.success : colors.mutedForeground }]}>
              {blurSettings.enabled ? 'Live' : 'Off'}
            </Text>
          </View>
        </View>

        <GlassCard style={styles.previewCard}>
          {/* The live preview — updates instantly on any setting change */}
          <BlurPreview settings={blurSettings} />

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#A855F7' }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Female</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Male</Text>
            </View>
            <View style={styles.legendSep} />
            <Text style={[styles.legendHint, { color: colors.mutedForeground }]}>
              {blurSettings.enabled
                ? `${blurSettings.method === 'faces' ? 'Face blur' : 'Full-body blur'} · ${blurSettings.intensity}`
                : 'Blur disabled — content shown as-is'}
            </Text>
          </View>
        </GlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body:          { paddingHorizontal: 20 },
  subtitle:      { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 20, lineHeight: 20 },
  sectionLabel:  { fontSize: 14.5, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusText:    { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  previewCard:   { gap: 14 },
  legend:        { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:     { width: 8, height: 8, borderRadius: 4 },
  legendLabel:   { fontSize: 11.5, fontFamily: 'Inter_500Medium' },
  legendSep:     { flex: 1 },
  legendHint:    { fontSize: 11, fontFamily: 'Inter_400Regular', flexShrink: 1 },
});
