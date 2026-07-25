import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather, FontAwesome6 } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { GlassCard } from '@/components/GlassCard';
import { GradientButton } from '@/components/GradientButton';
import type { OAuthProviderConfig } from '@/constants/oauthProviders';

interface ConnectAccountCardProps {
  meta: { icon: React.ComponentProps<typeof FontAwesome6>['name']; color: string };
  config: OAuthProviderConfig;
  isConfigured: boolean;
  isAuthorizing: boolean;
  error: string | null;
  onContinue: () => void;
}

export function ConnectAccountCard({
  meta,
  config,
  isConfigured,
  isAuthorizing,
  error,
  onContinue,
}: ConnectAccountCardProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  return (
    <GlassCard style={{ gap: 16 }}>
      <View style={[styles.headerRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1F` }]}>
          <FontAwesome6 name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('platformDetail.connectAccount')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {isConfigured
              ? t('platformDetail.oauthReady')
              : t('platformDetail.demoModeNotice')}
          </Text>
        </View>
      </View>

      <View style={[styles.badgeRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Feather
          name={isConfigured ? 'shield' : 'info'}
          size={13}
          color={isConfigured ? colors.success : colors.warning}
        />
        <Text
          style={[
            styles.badgeText,
            { color: isConfigured ? colors.success : colors.warning },
          ]}
        >
          {isConfigured ? t('platformDetail.oauthConfigured') : t('platformDetail.demoModeBadge')}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[styles.permissionsLabel, { color: colors.foreground }]}>
          {t('platformDetail.permissionsTitle')}
        </Text>
        {config.scopes.map((scope) => (
          <View key={scope} style={[styles.scopeRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Feather name="check-circle" size={14} color={colors.primary} />
            <Text style={[styles.scopeText, { color: colors.mutedForeground }]}>{scope}</Text>
          </View>
        ))}
      </View>

      {!isConfigured && (
        <View
          style={[
            styles.noticeBox,
            { backgroundColor: `${colors.warning}14`, borderRadius: colors.radius - 6 },
          ]}
        >
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            {t('platformDetail.demoModeBody')}
          </Text>
        </View>
      )}

      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
      ) : null}

      <GradientButton
        label={
          isAuthorizing
            ? t('platformDetail.authorizing')
            : `${t('platformDetail.continueWith')} ${config.name}`
        }
        onPress={onContinue}
        loading={isAuthorizing}
        icon={<Feather name="log-in" size={16} color="#FFFFFF" />}
      />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15.5, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  permissionsLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scopeText: { fontSize: 12.5, fontFamily: 'Inter_400Regular' },
  noticeBox: { padding: 12 },
  noticeText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  errorText: { fontSize: 12.5, fontFamily: 'Inter_500Medium' },
});
