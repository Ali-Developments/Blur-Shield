import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GlassCard } from '@/components/GlassCard';

interface NotificationItem {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  titleKey: string;
  body: string;
  time: string;
  read: boolean;
  tint: string;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();

  const initial: NotificationItem[] = useMemo(
    () => [
      {
        id: '1',
        icon: 'shield',
        titleKey: 'Protection Active',
        body: 'Your AI blur protection is keeping your feed safe.',
        time: '2h',
        read: false,
        tint: colors.primary,
      },
      {
        id: '2',
        icon: 'award',
        titleKey: 'Reward Earned',
        body: 'You earned 25 coins from watching an ad.',
        time: '5h',
        read: false,
        tint: colors.warning,
      },
      {
        id: '3',
        icon: 'zap',
        titleKey: 'Streak Milestone',
        body: 'You reached a 3-day protection streak. Keep it up!',
        time: '1d',
        read: true,
        tint: colors.accent,
      },
    ],
    [colors],
  );

  const [items, setItems] = useState(initial);
  const markAllRead = () => setItems((prev) => prev.map((i) => ({ ...i, read: true })));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12 }}>
      <ScreenHeader
        title={t('notifications.title')}
        right={
          <Pressable onPress={markAllRead}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 }}>
              {t('notifications.markAllRead')}
            </Text>
          </Pressable>
        }
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 12 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 40 }}>
            {t('notifications.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <GlassCard style={{ opacity: item.read ? 0.6 : 1 }}>
            <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.icon, { backgroundColor: `${item.tint}1F` }]}>
                <Feather name={item.icon} size={17} color={item.tint} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.title, { color: colors.foreground }]}>{item.titleKey}</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>{item.body}</Text>
              </View>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{item.time}</Text>
            </View>
          </GlassCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  time: { fontSize: 11.5, fontFamily: 'Inter_400Regular' },
});
