import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme, ThemeMode } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';

/* ─── Theme pill selector ─────────────────────────────────────── */
function ThemePill({ value, label, active, onPress }: {
  value: ThemeMode; label: string; active: boolean; onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.themePill,
        {
          backgroundColor: active ? colors.primary : colors.muted,
          borderColor: active ? colors.primary : 'transparent',
        },
      ]}
    >
      <Text style={[styles.themePillText, { color: active ? '#FFFFFF' : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ─── Settings link row with colored icon pill ────────────────── */
function LinkRow({
  icon,
  label,
  tint,
  onPress,
  destructive,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tint?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const iconColor = destructive ? colors.destructive : (tint ?? colors.foreground);
  const iconBg    = destructive ? `${colors.destructive}18` : (tint ? `${tint}18` : colors.muted);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkRow,
        isRTL && { flexDirection: 'row-reverse' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.linkIconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <Text style={[styles.linkLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/* ─── Screen ──────────────────────────────────────────────────── */
export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useLanguage();
  const { themeMode, setThemeMode } = useTheme();
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title={t('settings.title')} />

      <View style={styles.body}>
        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{t('settings.appearance')}</Text>
        <GlassCard style={styles.themeCard}>
          <View style={styles.themeRow}>
            <ThemePill
              value="dark"
              label={t('settings.darkMode')}
              active={themeMode === 'dark'}
              onPress={() => setThemeMode('dark')}
            />
            <ThemePill
              value="light"
              label={t('settings.lightMode')}
              active={themeMode === 'light'}
              onPress={() => setThemeMode('light')}
            />
          </View>
        </GlassCard>

        {/* Language */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{t('settings.language')}</Text>
        <GlassCard style={styles.themeCard}>
          <View style={styles.themeRow}>
            <ThemePill value={'en' as ThemeMode} label="English" active={language === 'en'} onPress={() => setLanguage('en')} />
            <ThemePill value={'ar' as ThemeMode} label="العربية" active={language === 'ar'} onPress={() => setLanguage('ar')} />
          </View>
        </GlassCard>

        {/* Links */}
        <GlassCard style={{ gap: 2 }} padding={8}>
          <LinkRow icon="sliders"    label={t('settings.blurSettings')}  tint={colors.secondary} onPress={() => router.push('/blur-settings')} />
          <LinkRow icon="bell"       label={t('settings.notifications')}  tint={colors.primary}   onPress={() => router.push('/notifications')} />
          <LinkRow icon="file-text"  label={t('settings.privacyPolicy')}  tint={colors.accent}    onPress={() => router.push('/privacy-policy')} />
          <LinkRow icon="help-circle" label={t('settings.helpSupport')}   tint={colors.warning}   onPress={() => router.push('/help-support')} />
          <LinkRow icon="activity"   label={t('audioTest.title')}         tint={colors.success}   onPress={() => router.push('/dev/audio-filter-test')} />
          <LinkRow icon="log-out"    label={t('settings.logout')}         onPress={handleLogout}  destructive />
        </GlassCard>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>{t('settings.version')} 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body:          { paddingHorizontal: 20 },
  sectionLabel:  { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.55 },
  themeCard:     { marginBottom: 20, paddingVertical: 10 },
  themeRow:      { flexDirection: 'row', gap: 10 },
  themePill:     { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5 },
  themePillText: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  linkRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 6 },
  linkIconWrap:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkLabel:     { flex: 1, fontSize: 14.5, fontFamily: 'Inter_500Medium' },
  version:       { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 24 },
});
