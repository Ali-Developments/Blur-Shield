import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function GradientButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
}: GradientButtonProps) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  if (variant === 'outline' || variant === 'ghost') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          {
            borderWidth: variant === 'outline' ? 1.5 : 0,
            borderColor: colors.border,
            backgroundColor: variant === 'ghost' ? colors.muted : 'transparent',
            borderRadius: colors.radius,
            opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} disabled={isDisabled} style={style}>
      {({ pressed }) => (
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.base,
            {
              borderRadius: colors.radius,
              opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              {icon}
              <Text style={styles.labelLight}>{label}</Text>
            </>
          )}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  labelLight: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
});
