import { Share, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { FileThumbnail } from '@/features/search/components/file-thumbnail';
import { formatDate } from '@/features/search/search-engine';
import type { FileItem } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  file: FileItem | null;
  reason: string;
  onClose: () => void;
};

export function FileSheet({ file, reason, onClose }: Props) {
  const theme = useTheme();

  return (
    <BottomSheet visible={file !== null} onClose={onClose} label={file ? `Preview of ${file.name}` : 'Preview'}>
      {file && (
        <View style={styles.body}>
          <View style={styles.preview}>
            <FileThumbnail preview={file.preview} large />
          </View>

          <View style={styles.titleBlock}>
            <Text variant="titleMedium" numberOfLines={2}>
              {file.name}
            </Text>
            <Text variant="bodyMedium" color="onSurfaceVariant">
              {formatDate(file.savedAt, true)} · {file.size}
            </Text>
          </View>

          <View style={[styles.reason, { backgroundColor: theme.surfaceContainerHigh }]}>
            <Text variant="labelMedium" color="onSurfaceVariant">
              Why it matched
            </Text>
            <Text variant="bodyMedium">{reason}</Text>
          </View>

          <View style={styles.location}>
            <Icon name="folder" size={20} color={theme.onSurfaceVariant} />
            <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.flex}>
              {file.folder}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label="Share"
              icon="share"
              variant="tonal"
              onPress={() => Share.share({ message: file.name, title: file.name })}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.five,
  },
  preview: {
    height: 220,
    alignSelf: 'center',
    width: '62%',
    borderRadius: Radius.medium,
  },
  titleBlock: {
    gap: Spacing.one,
  },
  reason: {
    borderRadius: Radius.medium,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
