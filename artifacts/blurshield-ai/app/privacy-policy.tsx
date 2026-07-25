import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';

const SECTIONS_EN = [
  {
    title: '1. Information We Collect',
    body: 'BlurShield AI stores your account details, protection preferences, and usage statistics locally on your device to provide the app\'s features. We do not sell your personal data to third parties.',
  },
  {
    title: '2. How Content Filtering Works',
    body: 'When you browse a connected platform inside BlurShield AI, our blur engine applies visual filters to media on the page based on the settings you choose. This processing happens on your device.',
  },
  {
    title: '3. Third-Party Platforms',
    body: 'When you sign in to a social platform inside the app, you are interacting directly with that platform under its own terms and privacy policy. BlurShield AI does not store your third-party account passwords on our servers.',
  },
  {
    title: '4. Coins & Rewards',
    body: 'Coins earned through rewarded ads have no cash value and cannot be exchanged, transferred, or redeemed for money.',
  },
  {
    title: '5. Children\'s Privacy',
    body: 'Kids Mode is designed to give parents control over a simplified, safe experience. Parents are responsible for setting and safeguarding their Kids Mode PIN.',
  },
  {
    title: '6. Data Retention',
    body: 'You can clear your local data at any time by logging out or uninstalling the app.',
  },
  {
    title: '7. Contact',
    body: 'For privacy questions, reach out through the Help & Support section of the app.',
  },
];

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('legal.privacyTitle')} />
      <View style={styles.body}>
        <Text style={[styles.updated, { color: colors.mutedForeground }]}>Last updated July 2026</Text>
        {SECTIONS_EN.map((section) => (
          <GlassCard key={section.title} style={{ marginBottom: 14 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{section.body}</Text>
          </GlassCard>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  updated: { fontSize: 12.5, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  sectionTitle: { fontSize: 14.5, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  sectionBody: { fontSize: 13.5, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
