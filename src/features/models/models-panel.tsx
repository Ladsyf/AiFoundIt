import { useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { LinearProgress } from '@/components/ui/linear-progress';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { ModelCard } from '@/features/models/model-card';
import { useModels } from '@/features/models/models-store';
import { useTheme } from '@/hooks/use-theme';
import { formatModelSize, progressFraction, progressLabel } from '@/lib/download-view';
import { formatBytes } from '@/lib/format';
import { MODEL_CATALOG, TOKEN_PAGE_URL, fitFor, recommendedPair, type ModelRole } from '@/lib/model-catalog';

const GROUPS: { role: ModelRole; title: string; blurb: string; missing: string }[] = [
  {
    role: 'embedder',
    title: 'Search model',
    blurb: 'Finds files by meaning, so “beach photo” or “lunch receipt” works without the exact words.',
    missing: 'Without one, search only matches the words in your files.',
  },
  {
    role: 'llm',
    title: 'Chat model',
    blurb: 'Writes the answers and understands questions in English and Taglish.',
    missing: 'Without one, answers are short fixed sentences.',
  },
];

function TokenField() {
  const theme = useTheme();
  const { token, saveToken, downloads } = useModels();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(token);
  const [saved, setSaved] = useState(false);
  const needsLogin = Object.values(downloads).some((d) => d.state === 'error' && d.code === 'AUTH');
  const expanded = open || needsLogin;

  if (!expanded) {
    return (
      <Button
        label={token ? 'Hugging Face login: saved' : 'Hugging Face login'}
        variant="text"
        icon="key"
        onPress={() => setOpen(true)}
        accessibilityHint="Only needed for models that ask you to accept a license"
      />
    );
  }

  return (
    <View style={styles.tokenBox}>
      <Text variant="titleSmall">Hugging Face login</Text>
      <Text variant="bodySmall" color="onSurfaceVariant">
        Most models download without an account. A few, like Gemma 3, ask you to accept a license on Hugging Face
        first. If that happens, accept it on the model page, create a free access token with read access, and paste it
        here. The token stays on this phone and is sent to huggingface.co only.
      </Text>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setSaved(false);
        }}
        placeholder="hf_…"
        placeholderTextColor={theme.onSurfaceVariant}
        accessibilityLabel="Hugging Face access token"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        importantForAutofill="no"
        style={[styles.input, { color: theme.onSurface, borderColor: theme.outline, backgroundColor: theme.surface }]}
      />
      <View style={styles.actions}>
        <Button
          label={saved ? 'Saved' : 'Save token'}
          variant="tonal"
          disabled={saved || draft.trim() === token}
          onPress={() => void saveToken(draft).then(() => setSaved(true))}
        />
        <Button
          label="Create a token"
          variant="text"
          icon="open_in_new"
          onPress={() => void Linking.openURL(TOKEN_PAGE_URL)}
          accessibilityHint="Opens Hugging Face in your browser"
        />
        {!needsLogin && <Button label="Hide" variant="text" onPress={() => setOpen(false)} />}
      </View>
    </View>
  );
}

function ImportProgress() {
  const { importing } = useModels();
  if (!importing) return null;
  const label = `Copying the model file, ${progressLabel(importing.bytes, importing.total)}`;
  return (
    <View style={styles.block}>
      <LinearProgress value={progressFraction(importing.bytes, importing.total)} label={label} />
      <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
        Copying · {progressLabel(importing.bytes, importing.total)}
      </Text>
    </View>
  );
}

type PanelProps = {
  // What each kind of model is doing right now ("Running on the GPU"), shown next to its heading.
  status?: Partial<Record<ModelRole, string>>;
};

export function ModelsPanel({ status }: PanelProps) {
  const theme = useTheme();
  const m = useModels();
  const pair = recommendedPair(m.device?.totalRamBytes);
  const isPick = (id: string) => id === pair.embedder.id || id === pair.llm.id;
  const others = m.installed.filter((i) => !i.catalogId && !i.partial);

  return (
    <View style={styles.root}>
      {m.device && (
        <Text variant="bodySmall" color="onSurfaceVariant">
          This phone: {m.device.model} · {formatBytes(m.device.totalRamBytes)} memory ·{' '}
          {formatBytes(m.device.freeStorageBytes)} free
        </Text>
      )}

      {GROUPS.map((group) => {
        const models = MODEL_CATALOG.filter((x) => x.role === group.role).sort(
          (a, b) => Number(isPick(b.id)) - Number(isPick(a.id)),
        );
        return (
          <View key={group.role} style={styles.group}>
            <View style={styles.groupHead}>
              <Text variant="titleSmall">{group.title}</Text>
              {status?.[group.role] && (
                <Text variant="bodySmall" color="onSurfaceVariant">
                  {status[group.role]}
                </Text>
              )}
            </View>
            <Text variant="bodySmall" color="onSurfaceVariant">
              {group.blurb}
              {m.loaded && !m.active[group.role] ? ` ${group.missing}` : ''}
            </Text>
            {models.map((model) => {
              const file = m.installed.find((i) => i.catalogId === model.id && !i.partial);
              const partial = m.installed.find((i) => i.catalogId === model.id && i.partial);
              const download = m.downloads[model.id];
              return (
                <View key={model.id} style={[styles.entry, { borderTopColor: theme.outlineVariant }]}>
                  <ModelCard
                    model={model}
                    installed={file !== undefined}
                    savedBytes={download ? 0 : (partial?.size ?? 0)}
                    download={download}
                    active={m.active[group.role]?.catalogId === model.id}
                    fit={fitFor(model, m.device?.totalRamBytes)}
                    recommended={isPick(model.id)}
                    onDownload={() => void m.download(model)}
                    onPause={() => void m.pause(model)}
                    onCancel={() => void m.cancel(model)}
                    onUse={() => {
                      if (file) void m.use(file);
                    }}
                    onDelete={() => {
                      if (file) void m.remove(file);
                    }}
                  />
                </View>
              );
            })}
          </View>
        );
      })}

      {others.length > 0 && (
        <View style={styles.group}>
          <Text variant="titleSmall">Other model files on this phone</Text>
          {others.map((o) => {
            const inUse = m.active[o.role]?.name === o.name;
            return (
              <View key={o.name} style={[styles.entry, { borderTopColor: theme.outlineVariant }]}>
                <Text variant="titleMedium" numberOfLines={2}>
                  {o.name}
                </Text>
                <Text variant="bodySmall" color="onSurfaceVariant">
                  {o.role === 'embedder' ? 'Search model' : 'Chat model'} · {formatModelSize(o.size)}
                  {inUse ? ' · In use' : ''}
                </Text>
                <View style={styles.actions}>
                  {!inUse && <Button label="Use this one" variant="tonal" onPress={() => void m.use(o)} />}
                  <Button
                    label="Delete"
                    variant="text"
                    onPress={() =>
                      Alert.alert(`Delete ${o.name}?`, 'The file is removed from this phone.', [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => void m.remove(o) },
                      ])
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={[styles.entry, styles.switchRow, { borderTopColor: theme.outlineVariant }]}>
        <View style={styles.flex}>
          <Text variant="bodyMedium">Download on Wi-Fi only</Text>
          <Text variant="bodySmall" color="onSurfaceVariant">
            Models are big. Turn this off to use mobile data.
          </Text>
        </View>
        <Switch
          value={m.wifiOnly}
          onValueChange={(on) => void m.changeWifiOnly(on)}
          accessibilityLabel="Download on Wi-Fi only"
          trackColor={{ false: theme.surfaceContainerHighest, true: theme.primary }}
          thumbColor={m.wifiOnly ? theme.onPrimary : theme.outline}
        />
      </View>

      {m.loaded && <TokenField />}

      <View style={[styles.entry, { borderTopColor: theme.outlineVariant }]}>
        <Text variant="bodySmall" color="onSurfaceVariant">
          Already have a model file (.litertlm) from a computer or a browser download? Pick it from this phone and
          AiFoundIt copies it in.
        </Text>
        <View style={styles.actions}>
          <Button
            label={m.importing ? 'Copying…' : 'Import from file'}
            variant="tonal"
            icon="upload_file"
            disabled={m.importing !== null}
            onPress={() => void m.importFromFile()}
            accessibilityHint="Choose a model file that is already on this phone"
          />
        </View>
        <ImportProgress />
      </View>

      {m.note && (
        <View style={[styles.noteBox, { backgroundColor: theme.surfaceContainerHigh }]}>
          <Text variant="bodySmall" style={styles.flex}>
            {m.note}
          </Text>
          <Button label="Dismiss" variant="text" onPress={m.dismissNote} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  entry: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  block: {
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tokenBox: {
    gap: Spacing.two,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.medium,
    paddingLeft: Spacing.three,
  },
});
