import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCoins } from '@/contexts/CoinContext';
import { GlassCard } from '@/components/GlassCard';
import { CoinPill } from '@/components/CoinPill';

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  return (
    <Pressable onPress={onPress} style={[styles.menuRow, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.menuIcon, { backgroundColor: destructive ? `${colors.destructive}1A` : colors.muted }]}>
        <Feather name={icon} size={16} color={destructive ? colors.destructive : colors.foreground} />
      </View>
      <Text style={[styles.menuLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      <Feather
        name={isRTL ? 'chevron-left' : 'chevron-right'}
        size={16}
        color={colors.mutedForeground}
      />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { balance } = useCoins();

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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>{t('profile.title')}</Text>

      <GlassCard style={styles.profileCard}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
        <Text style={[styles.name, { color: colors.foreground }]}>{user?.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user?.email}</Text>
        <Text style={[styles.since, { color: colors.mutedForeground }]}>
          {t('profile.memberSince')} {memberSince}
        </Text>
        <CoinPill amount={balance} />
      </GlassCard>

      <GlassCard style={{ gap: 2 }} padding={8}>
        <MenuRow icon="shield" label={t('home.platforms')} onPress={() => router.push('/platforms')} />
        <MenuRow icon="sliders" label={t('home.blurSettings')} onPress={() => router.push('/blur-settings')} />
        <MenuRow icon="gift" label={t('referral.title')} onPress={() => router.push('/referral')} />
        <MenuRow icon="bell" label={t('notifications.title')} onPress={() => router.push('/notifications')} />
        <MenuRow icon="settings" label={t('settings.title')} onPress={() => router.push('/settings')} />
        <MenuRow icon="help-circle" label={t('settings.helpSupport')} onPress={() => router.push('/help-support')} />
        <MenuRow icon="log-out" label={t('profile.logout')} onPress={handleLogout} destructive />
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  profileCard: { alignItems: 'center', gap: 8, marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { color: '#FFFFFF', fontSize: 28, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  email: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  since: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8 },
  menuIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 14.5, fontFamily: 'Inter_500Medium' },
});
