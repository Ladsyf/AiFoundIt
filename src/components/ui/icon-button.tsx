import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
};

export function IconButton({ icon, label, onPress, filled, disabled }: Props) {
  const theme = useTheme();
  const tint = disabled ? theme.onSurface : filled ? theme.onPrimary : theme.onSurfaceVariant;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: theme.outlineVariant, borderless: !filled, radius: 24 }}
      style={[
        styles.base,
        filled && { backgroundColor: disabled ? theme.surfaceContainerHighest : theme.primary },
      ]}>
      <View style={disabled && styles.disabled}>
        <Icon name={icon} color={tint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.38,
  },
});
