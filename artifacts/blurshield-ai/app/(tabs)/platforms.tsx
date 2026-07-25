import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PLATFORM_IDS, useProtection, type PlatformId } from '@/contexts/ProtectionContext';
import { PlatformCard } from '@/components/PlatformCard';

export default function PlatformsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { accounts, blurFilter, musicFilter, setBlurFilterEnabled, setMusicFilterEnabled } = useProtection();

  const renderItem = useCallback(({ item: id }: { item: PlatformId }) => (
    <PlatformCard
      key={id}
      id={id}
      label={t(`platforms.${id}`)}
      connected={accounts[id].connected}
      username={accounts[id].username}
      blurFilterEnabled={blurFilter[id]}
      musicFilterEnabled={musicFilter[id] ?? false}
      onToggleBlurFilter={(enabled) => setBlurFilterEnabled(id, enabled)}
      onToggleMusicFilter={(enabled) => setMusicFilterEnabled(id, enabled)}
      onPress={() => router.push(`/platform/${id}`)}
    />
  ), [accounts, blurFilter, musicFilter, t]);

  return (
    <FlatList
      data={PLATFORM_IDS}
      keyExtractor={(id) => id}
      renderItem={renderItem}
      removeClippedSubviews
      maxToRenderPerBatch={4}
      initialNumToRender={4}
      windowSize={5}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('platforms.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('platforms.subtitle')}</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  header:    { marginBottom: 20 },
  title:     { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  subtitle:  { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  sep:       { height: 12 },
});
