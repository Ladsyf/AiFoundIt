import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SUGGESTIONS: { icon: IconName; text: string }[] = [
  { icon: 'screenshot', text: 'The screenshot with the wifi password' },
  { icon: 'receipt_long', text: 'Receipts from last month' },
  { icon: 'description', text: 'My passport scan' },
  { icon: 'drive_file_move', text: 'Tidy up the receipts in Download' },
];

export function AccessRequest({ onAllow }: { onAllow: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.badge, { backgroundColor: theme.primaryContainer }]}>
        <Icon name="lock" size={28} color={theme.onPrimaryContainer} />
      </View>
      <Text variant="headlineSmall" style={styles.centerText} accessibilityRole="header">
        Find any file by describing it
      </Text>
      <Text variant="bodyLarge" color="onSurfaceVariant" style={[styles.centerText, styles.measure]}>
        AiFoundIt searches the files on this phone. Nothing is uploaded, and it works without a connection.
      </Text>
      <View style={styles.cta}>
        <Button label="Allow file access" onPress={onAllow} accessibilityHint="Lets AiFoundIt read files on this phone" />
      </View>
      <Text variant="bodySmall" color="onSurfaceVariant" style={styles.centerText}>
        This preview uses sample files, not your own.
      </Text>
    </View>
  );
}

export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.suggestions}>
      <Text variant="headlineSmall" accessibilityRole="header">
        What are you looking for?
      </Text>
      <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.subhead}>
        Describe it the way you’d remember it.
      </Text>
      <View style={styles.list}>
        {SUGGESTIONS.map((s) => (
          <View key={s.text} style={[styles.suggestionClip, { borderColor: theme.outlineVariant }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(s.text)}
              android_ripple={{ color: theme.outlineVariant }}
              style={styles.suggestion}>
              <Icon name={s.icon} size={20} color={theme.onSurfaceVariant} />
              <Text variant="bodyLarge" style={styles.flex}>
                {s.text}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.four,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: Radius.large + 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  measure: {
    maxWidth: 340,
  },
  cta: {
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  suggestions: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  subhead: {
    marginTop: Spacing.one,
  },
  list: {
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  suggestionClip: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
