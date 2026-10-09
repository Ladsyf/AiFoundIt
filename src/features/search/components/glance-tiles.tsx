import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSearch } from '@/features/search/store';
import { useTheme } from '@/hooks/use-theme';

const TILE_QUERY: Record<string, string> = {
  receipt: 'receipts',
  id: 'my IDs',
  school: 'school files',
  work: 'work files',
  screenshot: 'screenshots',
  meme: 'memes',
  document: 'documents',
  photo: 'photos',
};

export function GlanceTiles({ onPick }: { onPick: (text: string) => void }) {
  const theme = useTheme();
  const { glance } = useSearch();
  if (glance.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text variant="titleSmall" color="onSurfaceVariant">
        At a glance
      </Text>
      <View style={styles.tiles}>
        {glance.map((t) => (
          <View key={t.key} style={[styles.tileClip, { borderColor: theme.outlineVariant }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t.count} ${t.label}`}
              onPress={() => onPick(TILE_QUERY[t.key] ?? t.label.toLowerCase())}
              android_ripple={{ color: theme.outlineVariant }}
              style={styles.tile}>
              <Text variant="titleMedium">{t.count}</Text>
              <Text variant="bodySmall" color="onSurfaceVariant" numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tileClip: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  tile: {
    minWidth: 88,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.half,
  },
});
