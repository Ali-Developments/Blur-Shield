import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCoins } from '@/contexts/CoinContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';
import { GradientButton } from '@/components/GradientButton';

const TIERS = [
  { count: 1, key: 'tier1', coins: 25 },
  { count: 3, key: 'tier3', coins: 80 },
  { count: 5, key: 'tier5', coins: 150 },
];

export default function RewardsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { adsWatchedToday, maxAdsPerDay, isWatchingAd, watchAd, lastReward, dismissReward } = useCoins();
  const [cooldown, setCooldown] = useState(false);

  const atLimit = adsWatchedToday >= maxAdsPerDay;

  const handleWatch = async () => {
    if (cooldown || atLimit) return;
    const result = await watchAd();
    if (!result) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    }
  };

  useEffect(() => {
    if (lastReward) {
      const timer = setTimeout(() => dismissReward(), 2200);
      return () => clearTimeout(timer);
    }
  }, [lastReward, dismissReward]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('rewards.title')} />
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('rewards.subtitle')}</Text>

        <LinearGradient colors={[colors.primary, colors.secondary]} style={[styles.progressCard, { borderRadius: colors.radius }]}>
          <Text style={styles.progressLabel}>{t('rewards.adsToday')}</Text>
          <Text style={styles.progressValue}>
            {adsWatchedToday}/{maxAdsPerDay}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, (adsWatchedToday / maxAdsPerDay) * 100)}%` },
              ]}
            />
          </View>
        </LinearGradient>

        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Milestones</Text>
        <View style={{ gap: 12, marginBottom: 24 }}>
          {TIERS.map((tier) => {
            const reached = adsWatchedToday >= tier.count;
            return (
              <GlassCard key={tier.key} style={styles.tierRow} padding={16}>
                <View style={[styles.tierIcon, { backgroundColor: reached ? `${colors.success}1F` : colors.muted }]}>
                  <Feather name={reached ? 'check' : 'play'} size={16} color={reached ? colors.success : colors.mutedForeground} />
                </View>
                <Text style={[styles.tierLabel, { color: colors.foreground }]}>{t(`rewards.${tier.key}`)}</Text>
                <Text style={[styles.tierCoins, { color: colors.warning }]}>
                  +{tier.coins} {t('rewards.coinsShort')}
                </Text>
              </GlassCard>
            );
          })}
        </View>

        {atLimit ? (
          <Text style={[styles.limitText, { color: colors.destructive }]}>{t('rewards.maxReached')}</Text>
        ) : (
          <GradientButton
            label={isWatchingAd ? t('rewards.watching') : t('rewards.watchAd')}
            onPress={handleWatch}
            loading={isWatchingAd}
            disabled={atLimit}
            icon={<Feather name="play-circle" size={18} color="#FFFFFF" />}
          />
        )}
      </View>

      <Modal visible={!!lastReward} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalCard}>
            <LinearGradient colors={[colors.warning, '#F59E0B']} style={styles.modalIcon}>
              <Feather name="award" size={30} color="#FFFFFF" />
            </LinearGradient>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('rewards.rewardEarned')}</Text>
            <Text style={[styles.modalAmount, { color: colors.warning }]}>+{lastReward?.amount} coins</Text>
          </GlassCard>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 20, lineHeight: 20 },
  progressCard: { padding: 20, marginBottom: 24, gap: 8 },
  progressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' },
  progressValue: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Inter_700Bold' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 4 },
  sectionLabel: { fontSize: 14.5, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tierLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  tierCoins: { fontSize: 13.5, fontFamily: 'Inter_700Bold' },
  limitText: { textAlign: 'center', fontSize: 13.5, fontFamily: 'Inter_500Medium' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 40 },
  modalCard: { alignItems: 'center', gap: 10, width: '100%' },
  modalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  modalAmount: { fontSize: 22, fontFamily: 'Inter_700Bold' },
});
