import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// A short notice that stays on screen, for things the person should not miss (like demo mode).
export function Banner({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: theme.secondaryContainer }]}>
      <Text variant="bodySmall" style={{ color: theme.onSecondaryContainer }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
});
