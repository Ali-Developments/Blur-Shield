import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCoins, CoinTx } from '@/contexts/CoinContext';
import { GlassCard } from '@/components/GlassCard';
import { GradientButton } from '@/components/GradientButton';

function TxRow({ tx }: { tx: CoinTx }) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const isPositive = tx.amount > 0;
  return (
    <View style={[styles.txRow, isRTL && { flexDirection: 'row-reverse' }]}>
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isPositive ? `${colors.success}1F` : `${colors.destructive}1F` },
        ]}
      >
        <Feather name={isPositive ? 'arrow-down-left' : 'arrow-up-right'} size={15} color={isPositive ? colors.success : colors.destructive} />
      </View>
      <View style={styles.txTextWrap}>
        <Text style={[styles.txLabel, { color: colors.foreground }]}>{t(`wallet.${tx.label}`)}</Text>
        <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
          {new Date(tx.date).toLocaleDateString()}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: isPositive ? colors.success : colors.destructive }]}>
        {isPositive ? '+' : ''}
        {tx.amount}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { balance, history } = useCoins();

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      data={history}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TxRow tx={item} />}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('wallet.title')}</Text>

          <LinearGradient
            colors={[colors.secondary, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, { borderRadius: colors.radius + 6 }]}
          >
            <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
            <View style={[styles.balanceRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Feather name="circle" size={22} color="#FDE68A" />
              <Text style={styles.balanceValue}>{balance}</Text>
            </View>
            <GradientButton
              label={t('wallet.earnMore')}
              variant="ghost"
              style={{ marginTop: 6 }}
              onPress={() => router.push('/rewards')}
              icon={<Feather name="play-circle" size={16} color="#FFFFFF" />}
            />
          </LinearGradient>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('wallet.history')}</Text>
        </View>
      }
      ListEmptyComponent={
        <GlassCard>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('wallet.noHistory')}</Text>
        </GlassCard>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  balanceCard: { padding: 22, gap: 10, marginBottom: 22 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceValue: { color: '#FFFFFF', fontSize: 34, fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  txIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txTextWrap: { flex: 1, gap: 2 },
  txLabel: { fontSize: 14.5, fontFamily: 'Inter_600SemiBold' },
  txDate: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  txAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  empty: { textAlign: 'center', fontSize: 13.5, fontFamily: 'Inter_400Regular', paddingVertical: 12 },
});
