import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { FileThumbnail } from '@/features/search/components/file-thumbnail';
import type { FileItem } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/format';

type Props = {
  file: FileItem;
  onPress: () => void;
};

export function FileCard({ file, onPress }: Props) {
  const theme = useTheme();
  const folder = file.folder.split('/').pop();

  return (
    <View style={[styles.card, { borderColor: theme.outlineVariant, backgroundColor: theme.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${file.name}, ${formatDate(file.savedAt)}, in ${file.folder}`}
        accessibilityHint="Shows a preview and why it matched"
        onPress={onPress}
        android_ripple={{ color: theme.outlineVariant }}
        style={styles.pressable}>
        <View style={styles.thumb}>
          {file.preview && <FileThumbnail preview={file.preview} />}
        </View>
        <View style={styles.meta}>
          <Text variant="labelLarge" numberOfLines={1}>
            {file.name}
          </Text>
          <Text variant="bodySmall" color="onSurfaceVariant" numberOfLines={1}>
            {formatDate(file.savedAt)} · {folder}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  pressable: {
    padding: Spacing.two,
    gap: Spacing.two,
  },
  thumb: {
    height: 128,
  },
  meta: {
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.one,
    gap: Spacing.half,
  },
});
