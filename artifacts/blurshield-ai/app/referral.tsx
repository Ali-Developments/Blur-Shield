import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';
import { GradientButton } from '@/components/GradientButton';
import { StatCard } from '@/components/StatCard';

export default function ReferralScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const code = user?.referralCode ?? 'BLUR0000';

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on BlurShield AI and browse safely! Use my code ${code} to get started.`,
      });
    } catch {
      // user cancelled share sheet — no action needed
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('referral.title')} />
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('referral.subtitle')}</Text>

        <LinearGradient colors={[colors.secondary, colors.accent]} style={[styles.codeCard, { borderRadius: colors.radius + 4 }]}>
          <Text style={styles.codeLabel}>{t('referral.yourCode')}</Text>
          <View style={[styles.codeRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={styles.codeValue}>{code}</Text>
            <Pressable onPress={handleCopy} style={styles.copyBtn}>
              <Feather name={copied ? 'check' : 'copy'} size={16} color="#FFFFFF" />
              <Text style={styles.copyText}>{copied ? t('referral.copied') : t('referral.copy')}</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={[styles.statsRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <StatCard icon="users" label={t('referral.invited')} value="0" tint={colors.primary} />
          <StatCard icon="circle" label={t('referral.earnedFromReferrals')} value="0" tint={colors.warning} />
        </View>

        <GradientButton
          label={t('referral.share')}
          onPress={handleShare}
          icon={<Feather name="share-2" size={17} color="#FFFFFF" />}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 20, lineHeight: 20 },
  codeCard: { padding: 22, marginBottom: 20, gap: 12 },
  codeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeValue: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  copyText: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
});
