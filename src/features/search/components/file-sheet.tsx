import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { FileThumbnail } from '@/features/search/components/file-thumbnail';
import { useSearch } from '@/features/search/store';
import type { FileItem } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/format';
import { native } from '@/lib/native';

type Props = {
  file: FileItem | null;
  reason: string;
  onClose: () => void;
};

function HighlightedSnippet({ text, ranges }: { text: string; ranges?: [number, number][] }) {
  const theme = useTheme();
  if (!ranges || ranges.length === 0) return <Text variant="bodyMedium">{text}</Text>;
  const parts: { str: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of ranges) {
    if (a > cursor) parts.push({ str: text.slice(cursor, a), hit: false });
    parts.push({ str: text.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < text.length) parts.push({ str: text.slice(cursor), hit: false });
  return (
    <Text variant="bodyMedium">
      {parts.map((p, i) =>
        p.hit ? (
          <Text key={i} variant="bodyMedium" style={{ backgroundColor: theme.primaryContainer }}>
            {p.str}
          </Text>
        ) : (
          <Text key={i} variant="bodyMedium">
            {p.str}
          </Text>
        ),
      )}
    </Text>
  );
}

export function FileSheet({ file, reason, onClose }: Props) {
  const theme = useTheme();
  const { showSnackbar, describe, llmConfigured } = useSearch();
  const [busy, setBusy] = useState(false);
  const [describing, setDescribing] = useState(false);
  // What the chat model said about this photo just now (a saved description comes with the file).
  const [described, setDescribed] = useState<{ id: string; text: string } | null>(null);
  const description = file ? (file.description ?? (described?.id === file.id ? described.text : undefined)) : undefined;

  const describePhoto = async (f: FileItem) => {
    setDescribing(true);
    try {
      const text = await describe(f);
      if (text) setDescribed({ id: f.id, text });
      else showSnackbar({ text: 'Could not describe this photo. Choose a chat model that can read photos, like Gemma 4.' });
    } finally {
      setDescribing(false);
    }
  };

  const copyPath = async (f: FileItem) => {
    await Clipboard.setStringAsync(f.path.replace(/^\/storage\/emulated\/\d+\//, 'Internal storage/'));
    showSnackbar({ text: 'Path copied' });
  };

  const open = async (f: FileItem, how: 'default' | 'chooser') => {
    setBusy(true);
    try {
      const ok = await native.openFile(f.path, how);
      if (!ok) showSnackbar({ text: 'No app can open this file' });
    } catch {
      showSnackbar({ text: 'Could not open the file' });
    } finally {
      setBusy(false);
    }
  };

  const showInFolder = async (f: FileItem) => {
    const ok = await native.showInFolder(f.path).catch(() => false);
    if (!ok) await copyPath(f);
  };

  const share = async (f: FileItem) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(f.uri.startsWith('content:') || f.uri.startsWith('file:') ? f.uri : `file://${f.path}`, {
          mimeType: f.mime,
        });
      } else {
        await copyPath(f);
      }
    } catch {
      showSnackbar({ text: 'Sharing is not available for this file' });
    }
  };

  return (
    <BottomSheet visible={file !== null} onClose={onClose} label={file ? `Preview of ${file.name}` : 'Preview'}>
      {file && (
        <View style={styles.body}>
          <View style={styles.preview}>{file.preview && <FileThumbnail preview={file.preview} large />}</View>

          <View style={styles.titleBlock}>
            <Text variant="titleMedium" numberOfLines={2}>
              {file.name}
            </Text>
            <Text variant="bodyMedium" color="onSurfaceVariant">
              {formatDate(file.savedAt, true)} · {file.size}
              {file.page ? ` · page ${file.page}` : ''}
            </Text>
          </View>

          {file.snippet ? (
            <View style={[styles.reason, { backgroundColor: theme.surfaceContainerHigh }]}>
              <Text variant="labelMedium" color="onSurfaceVariant">
                Why it matched
              </Text>
              <HighlightedSnippet text={file.snippet} ranges={file.highlights} />
            </View>
          ) : (
            <View style={[styles.reason, { backgroundColor: theme.surfaceContainerHigh }]}>
              <Text variant="labelMedium" color="onSurfaceVariant">
                Why it matched
              </Text>
              <Text variant="bodyMedium">{reason}</Text>
            </View>
          )}

          {description && (
            <View style={[styles.reason, { backgroundColor: theme.surfaceContainerHigh }]}>
              <Text variant="labelMedium" color="onSurfaceVariant">
                What the photo shows
              </Text>
              <Text variant="bodyMedium">{description}</Text>
            </View>
          )}

          {file.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {file.tags.slice(0, 6).map((t) => (
                <View key={t} style={[styles.tag, { backgroundColor: theme.secondaryContainer }]}>
                  <Text variant="labelMedium" color="onSecondaryContainer">
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.location}>
            <Icon name="folder" size={20} color={theme.onSurfaceVariant} />
            <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.flex} numberOfLines={2}>
              {file.folder}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button label="Open" icon="open_in_new" onPress={() => file && void open(file, 'default')} accessibilityHint="Opens in the default app" />
            <Button label="Open with" variant="tonal" onPress={() => file && void open(file, 'chooser')} />
          </View>
          <View style={styles.actions}>
            <Button label="Show in folder" variant="text" icon="folder_open" onPress={() => file && void showInFolder(file)} />
            <Button label="Share" variant="text" icon="share" onPress={() => file && void share(file)} />
            <Button label="Copy path" variant="text" icon="content_copy" onPress={() => file && void copyPath(file)} />
          </View>
          {file.kind === 'image' && !description && llmConfigured && (
            <View style={styles.actions}>
              <Button
                label={describing ? 'Looking at the photo…' : 'Describe photo'}
                variant="tonal"
                icon="auto_awesome"
                disabled={describing}
                onPress={() => void describePhoto(file)}
                accessibilityHint="The chat model looks at the photo and writes what it shows, so the photo is easier to find"
              />
            </View>
          )}
          {busy && <Text variant="bodySmall" color="onSurfaceVariant">Opening…</Text>}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.four,
  },
  preview: {
    height: 220,
    alignSelf: 'center',
    width: '62%',
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  titleBlock: {
    gap: Spacing.one,
  },
  reason: {
    borderRadius: Radius.medium,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
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
    justifyContent: 'flex-start',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
