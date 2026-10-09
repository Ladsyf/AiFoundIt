import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSearch } from '@/features/search/store';
import { useTheme } from '@/hooks/use-theme';
import { deleteIndex, indexSizeBytes } from '@/lib/db/files';
import { formatBytes } from '@/lib/format';
import { deleteModelFile, detectModelConfig, importModelFile, type ModelFile } from '@/lib/models';
import { native } from '@/lib/native';
import { addScanRule, listScanRules, removeScanRule, type ScanRule } from '@/lib/scan-config';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="titleSmall" color="onSurfaceVariant">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.surfaceContainerLow, borderColor: theme.outlineVariant }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodyMedium" color="onSurfaceVariant">
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const store = useSearch();
  const [models, setModels] = useState<ModelFile[]>([]);
  const [rules, setRules] = useState<ScanRule[]>([]);
  const [bytesSent, setBytesSent] = useState<number | null>(null);
  const [indexSize, setIndexSize] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { files } = await detectModelConfig();
    setModels(files);
    setRules(await listScanRules().catch(() => []));
    setIndexSize(await indexSizeBytes().catch(() => 0));
    setBytesSent(await native.bytesSent().catch(() => null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);

  const exclude = async (path: string) => {
    await addScanRule(path, 'exclude');
    await reload();
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.surface }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.six }]}>
      <Text variant="headlineSmall" accessibilityRole="header" style={styles.title}>
        Settings
      </Text>

      <Section title="Models">
        <Row label="Embedder" value={store.backends.embedder === 'none' ? 'not loaded' : `on ${store.backends.embedder}`} />
        <Row label="Chat model" value={store.backends.llm === 'none' ? 'not loaded' : `on ${store.backends.llm}`} />
        {models.map((m) => (
          <View key={m.path} style={styles.row}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
              {m.name} · {formatBytes(m.size)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${m.name}`}
              onPress={() => void deleteModelFile(m.path).then(reload)}
              style={styles.iconBtn}>
              <Icon name="delete" size={20} color={theme.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}
        {models.length === 0 && (
          <Text variant="bodySmall" color="onSurfaceVariant">
            No models found. Push .litertlm files with adb, or import one.
          </Text>
        )}
        <View style={styles.rowButtons}>
          <Button
            label="Import model"
            variant="tonal"
            icon="download"
            onPress={() =>
              void importModelFile()
                .then((f) => setNote(f ? `Imported ${f.name}` : null))
                .then(reload)
            }
          />
        </View>
      </Section>

      <Section title="Scan folders">
        <Text variant="bodySmall" color="onSurfaceVariant">
          Whole-phone scan with default exclusions. Excluded folders are removed from results after the next rescan
          and are never opened.
        </Text>
        {rules.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
              {r.mode === 'exclude' ? 'Excluded' : 'Included'} · {r.path}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove rule for ${r.path}`}
              onPress={() => void removeScanRule(r.id).then(reload)}
              style={styles.iconBtn}>
              <Icon name="close" size={20} color={theme.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}
        <View style={styles.rowButtons}>
          <Button label="Exclude Private" variant="text" onPress={() => void exclude('Private')} />
          <Button label="Exclude Bank" variant="text" onPress={() => void exclude('Bank')} />
          <Button label="Exclude .Statuses" variant="text" onPress={() => void exclude('.Statuses')} />
        </View>
      </Section>

      <Section title="Index">
        <Row label="Files indexed" value={`${store.fileCount}`} />
        <Row label="Index size" value={formatBytes(indexSize)} />
        <View style={styles.rowButtons}>
          <Button label="Rescan" variant="tonal" icon="refresh" onPress={() => void store.startScan().then(reload)} />
          <Button
            label="Delete index"
            variant="text"
            onPress={() =>
              void deleteIndex()
                .then(store.refreshCounts)
                .then(reload)
                .then(() => setNote('Index deleted'))
            }
          />
        </View>
      </Section>

      <Section title="Privacy">
        <Row label="Bytes sent by this app" value={bytesSent === null ? 'unavailable' : `${bytesSent}`} />
        <Text variant="bodySmall" color="onSurfaceVariant">
          Files, text and vectors never leave this phone. The only network traffic is downloading models.
        </Text>
      </Section>

      {note && (
        <Text variant="bodySmall" color="onSurfaceVariant" style={styles.note}>
          {note}
        </Text>
      )}
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
  title: {
    paddingHorizontal: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconBtn: {
    padding: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  note: {
    textAlign: 'center',
  },
});
