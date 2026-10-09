import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'filled' | 'tonal' | 'text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  accessibilityHint?: string;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'filled', icon, accessibilityHint, disabled = false }: Props) {
  const theme = useTheme();
  const background =
    variant === 'filled' ? theme.primary : variant === 'tonal' ? theme.secondaryContainer : 'transparent';
  const foreground =
    variant === 'filled' ? theme.onPrimary : variant === 'tonal' ? theme.onSecondaryContainer : theme.primary;

  return (
    <View style={styles.clip}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        android_ripple={{ color: variant === 'filled' ? theme.onPrimary + '33' : theme.outlineVariant }}
        style={[
          styles.base,
          { backgroundColor: background, opacity: disabled ? 0.38 : 1 },
          variant === 'text' ? styles.textPadding : icon ? styles.iconPadding : styles.padding,
        ]}>
        {icon && <Icon name={icon} size={18} color={foreground} />}
        <Text variant="labelLarge" style={[styles.label, { color: foreground }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Some phones measure a label a fraction of a pixel narrower than they draw it (seen on a Galaxy S22+ with a
  // smaller font size), so its last word wrapped onto a hidden second line. A little spare width stops that.
  label: {
    paddingRight: 3,
  },
  clip: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  base: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  padding: {
    paddingHorizontal: Spacing.five,
  },
  iconPadding: {
    paddingLeft: Spacing.four,
    paddingRight: Spacing.five,
  },
  textPadding: {
    paddingHorizontal: Spacing.three,
  },
});
