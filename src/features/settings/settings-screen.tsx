import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { ModelsPanel } from '@/features/models/models-panel';
import { useSearch } from '@/features/search/store';
import { ScanFolders } from '@/features/settings/scan-folders';
import { Row, Section, SwitchRow } from '@/features/settings/settings-parts';
import { useTheme } from '@/hooks/use-theme';
import { isBackgroundEnabled } from '@/lib/background';
import { indexSizeBytes } from '@/lib/db/files';
import { formatBytes } from '@/lib/format';
import { native } from '@/lib/native';

const BACKEND_LABEL: Record<string, string> = { gpu: 'Running on the GPU', cpu: 'Running on the CPU', none: 'Not loaded' };
const number = new Intl.NumberFormat('en-GB');

function readAllFilesAccess(): boolean {
  try {
    return native.hasAllFilesAccess();
  } catch {
    return false;
  }
}

export function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const store = useSearch();
  const [bytesSent, setBytesSent] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<number | null>(null);
  const [indexSize, setIndexSize] = useState(0);
  const [background, setBackground] = useState(false);
  const [allFiles, setAllFiles] = useState(readAllFilesAccess);

  const reload = useCallback(async () => {
    setIndexSize(await indexSizeBytes().catch(() => 0));
    setBytesSent(await native.bytesSent().catch(() => null));
    const traffic = await native.downloadTraffic().catch(() => null);
    setDownloaded(traffic ? traffic.received : null);
    setBackground(await isBackgroundEnabled());
  }, []);

  // Numbers on this screen are refreshed when it opens and whenever the index changes.
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload, store.fileCount, store.indexing]);

  // Coming back from the system settings screen, check the access again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setAllFiles(readAllFilesAccess());
    });
    return () => sub.remove();
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const confirmDelete = () =>
    Alert.alert('Delete the index?', 'Your files are not touched. Search will be empty until you scan again.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void store.deleteIndex().then(reload) },
    ]);

  const scanLabel =
    store.indexing && store.indexTotal > 0
      ? `${number.format(store.indexed)} of ${number.format(store.indexTotal)}`
      : store.indexing
        ? 'Starting…'
        : null;

  return (
    <ScrollView
      style={{ backgroundColor: theme.surface }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.six }]}>
      <View style={styles.header}>
        <IconButton icon="arrow_back" label="Back to search" onPress={goBack} />
        <Text variant="headlineSmall" accessibilityRole="header">
          Settings
        </Text>
      </View>

      {store.isMock && (
        <Banner>
          Demo mode: this build has no on-device engine, so you are looking at sample files and the models below do
          nothing.
        </Banner>
      )}

      <Section title="AI models">
        <ModelsPanel
          status={{
            embedder: BACKEND_LABEL[store.backends.embedder],
            llm: store.backends.llmLoading ? 'Loading…' : BACKEND_LABEL[store.backends.llm],
          }}
        />
      </Section>

      <Section title="Scan folders">
        <ScanFolders />
      </Section>

      <Section title="Index">
        <Row label="Files indexed" value={number.format(store.fileCount)} />
        <Row label="Index size" value={formatBytes(indexSize)} />
        {scanLabel && <Row label="Scanning" value={scanLabel} />}
        <View style={styles.actions}>
          <Button
            label="Rescan"
            variant="tonal"
            icon="refresh"
            disabled={store.indexing || store.access !== 'granted'}
            onPress={() => void store.startScan().then(reload)}
            accessibilityHint="Looks for new and changed files"
          />
          <Button
            label="Delete index"
            variant="text"
            disabled={store.indexing}
            onPress={confirmDelete}
            accessibilityHint="Empties the search index. Your files are not touched"
          />
        </View>
      </Section>

      <Section title="Background">
        <SwitchRow
          label="Keep the index up to date"
          hint="Checks for new photos, recordings and documents while the phone charges, and when a new photo is taken. Android may delay it."
          value={background}
          onChange={(on) => {
            setBackground(on);
            void store.setBackgroundIndexing(on);
          }}
        />
        <View style={styles.actions}>
          <Button
            label="Battery settings"
            variant="text"
            onPress={() => void native.openBatterySettings()}
            accessibilityHint="If Android stops background work, set AiFoundIt to unrestricted"
          />
        </View>
      </Section>

      <Section title="Access">
        <Row label="All files access" value={allFiles ? 'Allowed' : 'Not allowed'} />
        <Text variant="bodySmall" color="onSurfaceVariant">
          Lets AiFoundIt read PDFs and other documents anywhere on the phone. Photos, videos and audio work without it.
        </Text>
        {!allFiles && (
          <View style={styles.actions}>
            <Button label="Allow" variant="tonal" onPress={() => void native.openAllFilesAccessSettings()} />
          </View>
        )}
      </Section>

      <Section title="Privacy">
        <Row label="Sent by this app" value={bytesSent === null ? 'unavailable' : `${number.format(bytesSent)} bytes`} />
        <Row
          label="Used by model downloads"
          value={downloaded === null ? 'unavailable' : formatBytes(downloaded)}
        />
        <Text variant="bodySmall" color="onSurfaceVariant">
          Your files, their text and the search index never leave this phone. The only thing the app downloads is the
          models you choose. “Sent” counts what this app has sent since it opened, not counting model downloads.
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
