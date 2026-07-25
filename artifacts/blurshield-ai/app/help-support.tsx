import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';

const FAQS = [
  {
    q: 'How does the AI blur system work?',
    a: 'When you browse a connected platform inside BlurShield AI, the blur engine applies visual filters directly to images and videos on the page in real time, based on your chosen target and intensity in Blur Settings.',
  },
  {
    q: 'How do I earn coins?',
    a: 'Open Rewards from your Home screen or Wallet and watch rewarded ads. You earn 25 coins per ad, with bonus coins at your 3rd and 5th ad each day, up to 10 ads per day.',
  },
  {
    q: 'How do I set up Kids Mode?',
    a: 'Go to Kids Mode from Settings or your Profile, set a 4-digit parent PIN, and enable it. Your PIN is required again to exit Kids Mode.',
  },
  {
    q: 'Can I switch between English and Arabic anytime?',
    a: 'Yes. Open Settings and choose your language — the app updates instantly, including right-to-left layout for Arabic.',
  },
  {
    q: 'Is my social media password stored on your servers?',
    a: 'No. Your platform sign-ins happen directly with that platform. BlurShield AI does not transmit your platform passwords to its own servers.',
  },
];

function FaqRow({ q, a }: { q: string; a: string }) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        setOpen((o) => !o);
      }}
    >
      <GlassCard style={{ marginBottom: 12 }}>
        <View style={[styles.faqHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={[styles.faqQ, { color: colors.foreground }]}>{q}</Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </View>
        {open ? <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{a}</Text> : null}
      </GlassCard>
    </Pressable>
  );
}

export default function HelpSupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('legal.helpTitle')} />
      <View style={styles.body}>
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{t('legal.faq')}</Text>
        {FAQS.map((f) => (
          <FaqRow key={f.q} q={f.q} a={f.a} />
        ))}

        <Text style={[styles.sectionLabel, { color: colors.foreground, marginTop: 12 }]}>
          {t('legal.contactUs')}
        </Text>
        <GlassCard style={styles.contactRow}>
          <View style={[styles.contactIcon, { backgroundColor: `${colors.primary}1F` }]}>
            <Feather name="mail" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactEmail, { color: colors.foreground }]}>support@blurshield.app</Text>
            <Text style={[styles.contactBody, { color: colors.mutedForeground }]}>{t('legal.contactBody')}</Text>
          </View>
        </GlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 14.5, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  faqA: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  contactEmail: { fontSize: 14.5, fontFamily: 'Inter_600SemiBold' },
  contactBody: { fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
