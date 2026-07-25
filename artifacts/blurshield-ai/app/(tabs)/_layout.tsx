import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout() {
  const { t } = useLanguage();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="home">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>{t('home.greeting').split(' ')[0]}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="platforms">
        <Icon sf={{ default: 'shield', selected: 'shield.fill' }} />
        <Label>{t('home.platforms')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="wallet">
        <Icon sf={{ default: 'wallet.pass', selected: 'wallet.pass.fill' }} />
        <Label>{t('home.wallet')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>{t('stats.title')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <Label>{t('profile.title')}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  const tabDef = (name: string, title: string, icon: keyof typeof Feather.glyphMap, sf: string) => ({
    name,
    options: {
      title,
      tabBarIcon: ({ color }: { color: string }) =>
        isIOS ? (
          <SymbolView name={sf as any} tintColor={color} size={22} />
        ) : (
          <Feather name={icon} size={20} color={color} />
        ),
    },
  });

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          direction: isRTL ? 'rtl' : 'ltr',
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen {...tabDef('home', t('home.greeting').split(' ')[0], 'home', 'house')} />
      <Tabs.Screen {...tabDef('platforms', t('home.platforms'), 'shield', 'shield')} />
      <Tabs.Screen {...tabDef('wallet', t('home.wallet'), 'credit-card', 'wallet.pass')} />
      <Tabs.Screen {...tabDef('stats', t('stats.title'), 'bar-chart-2', 'chart.bar')} />
      <Tabs.Screen {...tabDef('profile', t('profile.title'), 'user', 'person.crop.circle')} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
