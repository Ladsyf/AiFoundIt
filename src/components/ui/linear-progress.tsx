import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function LinearProgress({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, value));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: theme.secondaryContainer }]}>
      <View style={[styles.bar, { width: `${clamped * 100}%`, backgroundColor: theme.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
});
