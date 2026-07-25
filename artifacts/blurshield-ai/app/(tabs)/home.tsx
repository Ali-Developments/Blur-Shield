import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCoins } from '@/contexts/CoinContext';
import { useProtection } from '@/contexts/ProtectionContext';
import { GlassCard } from '@/components/GlassCard';
import { ProtectionBadge } from '@/components/ProtectionBadge';
import { StatCard } from '@/components/StatCard';
import { CoinPill } from '@/components/CoinPill';
import { ActivityRow } from '@/components/ActivityRow';
import { Pressable } from 'react-native';

function QuickAction({
  icon,
  label,
  onPress,
  tint,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  tint: string;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: `${tint}1F`, borderRadius: colors.radius }]}>
        <Feather name={icon} size={19} color={tint} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { balance, adsWatchedToday, maxAdsPerDay } = useCoins();
  const { blurSettings, stats, activity } = useProtection();

  const hours = (stats.protectionSeconds / 3600).toFixed(1);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.headerRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {t('home.greeting')}
          </Text>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {user?.name}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/notifications')} style={[styles.bell, { backgroundColor: colors.muted }]}>
          <Feather name="bell" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroCard, { borderRadius: colors.radius + 6 }]}
      >
        <View style={[styles.heroTop, isRTL && { flexDirection: 'row-reverse' }]}>
          <ProtectionBadge
            active={blurSettings.enabled}
            activeLabel={t('home.protectionActive')}
            inactiveLabel={t('home.protectionDisabled')}
          />
          <CoinPill amount={balance} />
        </View>
        <Image
          source={require('@/assets/illustrations/ai_guardian.png')}
          style={styles.heroImage}
          contentFit="cover"
        />
        <View style={[styles.heroBottomRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.heroCaption}>{t('home.dailyAdProgress')}</Text>
          <Text style={styles.heroCaptionBold}>
            {adsWatchedToday}/{maxAdsPerDay} {t('home.adsWatched')}
          </Text>
        </View>
      </LinearGradient>

      <View style={[styles.statsRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <StatCard icon="eye-off" label={t('home.filtered')} value={String(stats.totalFiltered)} tint={colors.primary} />
        <StatCard icon="clock" label={t('home.hours')} value={`${hours}h`} tint={colors.accent} />
        <StatCard icon="zap" label={t('home.streak')} value={`${stats.dailyStreak}`} tint={colors.warning} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('home.quickActions')}</Text>
      <View style={[styles.quickRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <QuickAction icon="shield" label={t('home.platforms')} tint={colors.primary} onPress={() => router.push('/platforms')} />
        <QuickAction icon="credit-card" label={t('home.wallet')} tint={colors.warning} onPress={() => router.push('/wallet')} />
        <QuickAction icon="sliders" label={t('home.blurSettings')} tint={colors.secondary} onPress={() => router.push('/blur-settings')} />
        <QuickAction icon="bar-chart-2" label={t('home.stats')} tint={colors.accent} onPress={() => router.push('/stats')} />
      </View>

      <View style={[styles.sectionHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
          {t('home.recentActivity')}
        </Text>
        <Pressable onPress={() => router.push('/stats')}>
          <Text style={[styles.viewAll, { color: colors.primary }]}>{t('home.viewAll')}</Text>
        </Pressable>
      </View>

      <GlassCard style={{ marginBottom: insets.bottom + 100 }}>
        {activity.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('home.noActivity')}</Text>
        ) : (
          activity.slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} />)
        )}
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  greeting: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  name: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 2 },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: { padding: 20, marginBottom: 18, gap: 14, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroImage: { width: '100%', height: 130, borderRadius: 16 },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroCaption: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontFamily: 'Inter_500Medium' },
  heroCaptionBold: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_700Bold' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 14 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  viewAll: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 24 },
  quickAction: { width: '22%', alignItems: 'center', gap: 8 },
  quickIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  empty: { fontSize: 13.5, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 12 },
});
