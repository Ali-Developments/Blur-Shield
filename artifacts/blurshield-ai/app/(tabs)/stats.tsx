import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProtection } from '@/contexts/ProtectionContext';
import { useCoins } from '@/contexts/CoinContext';
import { GlassCard } from '@/components/GlassCard';
import { StatCard } from '@/components/StatCard';
import { SegmentedControl } from '@/components/SegmentedControl';

function buildRange(days: number) {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { stats, activity } = useProtection();
  const { history } = useCoins();
  const [range, setRange] = useState<'weekly' | 'monthly'>('weekly');

  const days = range === 'weekly' ? 7 : 30;
  const labels = useMemo(() => buildRange(days), [days]);
  const maxSeconds = Math.max(1, ...labels.map((d) => stats.dailySeconds[d] ?? 0));
  const coinsEarned = history.filter((h) => h.amount > 0).reduce((sum, h) => sum + h.amount, 0);
  const hours = (stats.protectionSeconds / 3600).toFixed(1);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>{t('stats.title')}</Text>

      <View style={styles.statsGrid}>
        <StatCard icon="eye-off" label={t('stats.totalFiltered')} value={String(stats.totalFiltered)} tint={colors.primary} />
        <StatCard icon="clock" label={t('stats.protectionHours')} value={`${hours}h`} tint={colors.accent} />
      </View>
      <View style={styles.statsGrid}>
        <StatCard icon="circle" label={t('stats.coinsEarned')} value={String(coinsEarned)} tint={colors.warning} />
        <StatCard icon="zap" label={t('stats.dailyStreak')} value={`${stats.dailyStreak} ${t('stats.days')}`} tint={colors.secondary} />
      </View>

      <View style={{ marginTop: 8, marginBottom: 16 }}>
        <SegmentedControl
          options={[
            { value: 'weekly', label: t('stats.weekly') },
            { value: 'monthly', label: t('stats.monthly') },
          ]}
          value={range}
          onChange={setRange}
        />
      </View>

      <GlassCard style={{ marginBottom: 20 }}>
        <View style={styles.chart}>
          {labels.map((d) => {
            const seconds = stats.dailySeconds[d] ?? 0;
            const heightPct = Math.max(4, (seconds / maxSeconds) * 100);
            return (
              <View key={d} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: `${heightPct}%`, backgroundColor: colors.primary, borderRadius: 6 },
                    ]}
                  />
                </View>
                {range === 'weekly' ? (
                  <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
                    {new Date(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </GlassCard>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('home.recentActivity')}</Text>
      <GlassCard>
        {activity.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('home.noActivity')}</Text>
        ) : (
          activity.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.activityLine,
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 13.5 }}>
                {t(`platforms.${item.platform}`)} · {item.type === 'filtered' ? `${t('home.filtered')} (${item.count})` : item.type}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                {new Date(item.timestamp).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%' },
  barLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  empty: { textAlign: 'center', fontSize: 13.5, fontFamily: 'Inter_400Regular', paddingVertical: 12 },
  activityLine: { paddingVertical: 10, gap: 3 },
});
