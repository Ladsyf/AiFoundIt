import { Alert, Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LinearProgress } from '@/components/ui/linear-progress';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { DownloadView } from '@/features/models/models-store';
import { useTheme } from '@/hooks/use-theme';
import { downloadErrorCopy, formatModelSize, progressFraction, progressLabel } from '@/lib/download-view';
import { modelPageUrl, type CatalogModel, type Fit } from '@/lib/model-catalog';

type Props = {
  model: CatalogModel;
  // True when the finished file is on this phone.
  installed: boolean;
  // Bytes saved from a download that is not running (stopped, or the app was closed). 0 when there are none.
  savedBytes: number;
  download?: DownloadView;
  active: boolean;
  fit: Fit;
  recommended: boolean;
  onDownload: () => void;
  onPause: () => void;
  onCancel: () => void;
  onUse: () => void;
  onDelete: () => void;
};

const FIT_NOTE: Record<Exclude<Fit, 'ok'>, (model: CatalogModel) => string> = {
  tight: () => 'This phone has less memory than this model likes. It may be slow, or the app may close.',
  'too-big': (model) => `This model needs about ${model.minRamGb} GB of memory, and this phone probably has less.`,
};

function Chip({ label, tone }: { label: string; tone: 'primary' | 'neutral' }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: tone === 'primary' ? theme.primaryContainer : theme.surfaceContainerHigh },
      ]}>
      <Text
        variant="labelMedium"
        style={{ color: tone === 'primary' ? theme.onPrimaryContainer : theme.onSurfaceVariant }}>
        {label}
      </Text>
    </View>
  );
}

export function ModelCard({
  model,
  installed,
  savedBytes,
  download,
  active,
  fit,
  recommended,
  onDownload,
  onPause,
  onCancel,
  onUse,
  onDelete,
}: Props) {
  const theme = useTheme();

  const confirmDelete = () =>
    Alert.alert(`Delete ${model.name}?`, `This frees ${formatModelSize(model.sizeBytes)}. You can download it again later.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  // A model far too big for this phone can make Android close the app while it loads, so ask first.
  const confirmUse = () => {
    if (fit !== 'too-big') {
      onUse();
      return;
    }
    Alert.alert(
      `Use ${model.name}?`,
      'This model probably needs more memory than this phone has. Android may close AiFoundIt while it loads.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use anyway', style: 'destructive', onPress: onUse },
      ],
    );
  };

  const discard = (bytes: number) => {
    if (bytes < 50_000_000) {
      onCancel();
      return;
    }
    Alert.alert('Discard this download?', `${formatModelSize(bytes)} already downloaded will be removed.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ]);
  };

  const facts = [model.maker, formatModelSize(model.sizeBytes), model.vision ? 'Reads photos' : null]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const bytes = download?.bytes ?? savedBytes;
  const total = download?.total || model.sizeBytes;
  const error = download?.state === 'error' ? downloadErrorCopy(download.code, download.message) : null;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="titleMedium">{model.name}</Text>
          <Text variant="bodySmall" color="onSurfaceVariant">
            {facts}
          </Text>
        </View>
        {active ? (
          <Chip label="In use" tone="primary" />
        ) : recommended && !installed ? (
          <Chip label="Recommended" tone="neutral" />
        ) : null}
      </View>

      <Text variant="bodyMedium" color="onSurfaceVariant">
        {model.summary}
      </Text>

      {!installed && fit !== 'ok' && (
        <View style={styles.inline}>
          <Icon name="warning" size={16} color={theme.onSurfaceVariant} />
          <Text variant="bodySmall" color="onSurfaceVariant" style={styles.flex}>
            {FIT_NOTE[fit](model)}
          </Text>
        </View>
      )}

      {!installed && model.gated && !error && (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Asks for a free Hugging Face account the first time.
        </Text>
      )}

      {installed && (
        <View style={styles.actions}>
          <View style={styles.inline}>
            <Icon name="check_circle" size={18} color={theme.primary} />
            <Text variant="labelLarge" color="onSurfaceVariant">
              On this phone
            </Text>
          </View>
          {!active && (
            <Button label="Use this one" variant="tonal" onPress={confirmUse} accessibilityHint={`Switches to ${model.name}`} />
          )}
          <Button
            label="Delete"
            variant="text"
            onPress={confirmDelete}
            accessibilityHint={`Removes ${model.name} from this phone`}
          />
        </View>
      )}

      {!installed && download?.state === 'downloading' && (
        <View style={styles.block}>
          <LinearProgress
            value={progressFraction(bytes, total)}
            label={`Downloading ${model.name}, ${progressLabel(bytes, total)}`}
          />
          <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
            {download.retrying ? 'Connection lost. Trying again… ' : ''}
            {progressLabel(bytes, total)}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Pause"
              variant="tonal"
              icon="pause"
              onPress={onPause}
              accessibilityHint={`Pauses the ${model.name} download`}
            />
            <Button
              label="Cancel"
              variant="text"
              onPress={() => discard(bytes)}
              accessibilityHint={`Stops the ${model.name} download`}
            />
          </View>
        </View>
      )}

      {!installed && download?.state === 'paused' && (
        <View style={styles.block}>
          <LinearProgress
            value={progressFraction(bytes, total)}
            label={`${model.name} paused, ${progressLabel(bytes, total)}`}
          />
          <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
            Paused · {progressLabel(bytes, total)}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Resume"
              icon="play_arrow"
              onPress={onDownload}
              accessibilityHint={`Continues the ${model.name} download`}
            />
            <Button
              label="Discard"
              variant="text"
              onPress={() => discard(bytes)}
              accessibilityHint={`Removes the saved part of ${model.name}`}
            />
          </View>
        </View>
      )}

      {!installed && error && (
        <View style={styles.block}>
          <View style={styles.inline}>
            <Icon name="error" size={18} color={theme.error} />
            <Text variant="bodyMedium" style={[styles.flex, { color: theme.error }]}>
              {error.text}
            </Text>
          </View>
          {bytes > 0 && (
            <Text variant="bodySmall" color="onSurfaceVariant">
              {progressLabel(bytes, total)} saved.
            </Text>
          )}
          <View style={styles.actions}>
            <Button
              label={bytes > 0 ? 'Continue' : 'Try again'}
              icon="refresh"
              onPress={onDownload}
              accessibilityHint={`Tries to download ${model.name} again`}
            />
            {error.needsLogin && (
              <Button
                label="Open model page"
                variant="tonal"
                icon="open_in_new"
                onPress={() => void Linking.openURL(modelPageUrl(model))}
                accessibilityHint="Opens Hugging Face in your browser, where you accept the license"
              />
            )}
            {bytes > 0 && <Button label="Discard" variant="text" onPress={() => discard(bytes)} />}
          </View>
        </View>
      )}

      {!installed && !download && (
        <View style={styles.block}>
          {savedBytes > 0 && (
            <>
              <LinearProgress
                value={progressFraction(savedBytes, total)}
                label={`${model.name} stopped, ${progressLabel(savedBytes, total)}`}
              />
              <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
                Stopped · {progressLabel(savedBytes, total)}
              </Text>
            </>
          )}
          <View style={styles.actions}>
            <Button
              label={savedBytes > 0 ? 'Continue download' : `Download · ${formatModelSize(model.sizeBytes)}`}
              icon="download"
              onPress={onDownload}
              accessibilityHint={`Downloads ${model.name} to this phone`}
            />
            {savedBytes > 0 && <Button label="Discard" variant="text" onPress={() => discard(savedBytes)} />}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.two,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  block: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  chip: {
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
