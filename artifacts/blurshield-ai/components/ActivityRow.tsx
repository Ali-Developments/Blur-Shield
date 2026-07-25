import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PLATFORM_META } from '@/components/PlatformCard';
import type { ActivityItem } from '@/contexts/ProtectionContext';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const colors = useColors();
  const { isRTL, t } = useLanguage();
  const meta = PLATFORM_META[item.platform];
  const platformLabel = t(`platforms.${item.platform}`);

  const description =
    item.type === 'filtered'
      ? `${t('home.filtered')} · ${platformLabel} (${item.count})`
      : item.type === 'session_start'
        ? `${t('platformDetail.startBrowsing')} · ${platformLabel}`
        : `${t('platformDetail.exitBrowsing')} · ${platformLabel}`;

  return (
    <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1F` }]}>
        <Feather
          name={item.type === 'filtered' ? 'eye-off' : 'activity'}
          size={15}
          color={meta.color}
        />
      </View>
      <Text style={[styles.desc, { color: colors.foreground }]} numberOfLines={1}>
        {description}
      </Text>
      <Text style={[styles.time, { color: colors.mutedForeground }]}>
        {timeAgo(item.timestamp)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
  },
  time: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
