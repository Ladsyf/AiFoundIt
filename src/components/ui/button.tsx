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
};

export function Button({ label, onPress, variant = 'filled', icon, accessibilityHint }: Props) {
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
        onPress={onPress}
        android_ripple={{ color: variant === 'filled' ? theme.onPrimary + '33' : theme.outlineVariant }}
        style={[
          styles.base,
          { backgroundColor: background },
          variant === 'text' ? styles.textPadding : icon ? styles.iconPadding : styles.padding,
        ]}>
        {icon && <Icon name={icon} size={18} color={foreground} />}
        <Text variant="labelLarge" style={{ color: foreground }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
