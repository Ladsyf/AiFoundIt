import { Directory } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSearch } from '@/features/search/store';
import { useTheme } from '@/hooks/use-theme';
import { removeExcludedFromIndex } from '@/lib/db/maintenance';
import { configureNative } from '@/lib/native-setup';
import {
  addScanRule,
  effectiveExcludes,
  getScanMode,
  listScanRules,
  removeScanRule,
  setScanMode,
  type RuleMode,
  type ScanMode,
  type ScanRule,
} from '@/lib/scan-config';
import { QUICK_EXCLUDES, treeUriToRelativePath } from '@/lib/scan-paths';

function RuleRow({ icon, label, detail, onRemove }: { icon: IconName; label: string; detail?: string; onRemove?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.ruleRow}>
      <Icon name={icon} size={20} color={theme.onSurfaceVariant} />
      <View style={styles.flex}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {label}
        </Text>
        {detail && (
          <Text variant="bodySmall" color="onSurfaceVariant">
            {detail}
          </Text>
        )}
      </View>
      {onRemove && <IconButton icon="close" label={`Remove ${label}`} onPress={onRemove} />}
    </View>
  );
}

// Choose a folder with the system picker, or type its name or path. The caller gets the cleaned-up text and
// answers with a problem to show (or null when the folder was added).
function FolderAdder({ placeholder, onAdd }: { placeholder: string; onAdd: (input: string) => Promise<string | null> }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (input: string) => {
    const result = await onAdd(input);
    setProblem(result);
    if (!result) setText('');
  };

  const pick = async () => {
    try {
      const dir = await Directory.pickDirectoryAsync();
      const rel = treeUriToRelativePath(dir.uri);
      if (!rel) {
        setProblem('Pick a folder inside internal storage. The top level of the phone cannot be used.');
        return;
      }
      await submit(rel);
    } catch (e) {
      if (!/cancel/i.test(String(e))) setProblem('The folder picker could not open.');
    }
  };

  return (
    <View style={styles.adder}>
      <View style={styles.actions}>
        <Button label="Choose a folder" variant="tonal" icon="folder_open" onPress={() => void pick()} />
      </View>
      <View style={styles.typeRow}>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            setProblem(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={theme.onSurfaceVariant}
          accessibilityLabel="Folder name or path"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit(text)}
          style={[styles.input, { color: theme.onSurface, borderColor: theme.outline, backgroundColor: theme.surface }]}
        />
        <Button label="Add" variant="tonal" disabled={text.trim().length === 0} onPress={() => void submit(text)} />
      </View>
      {problem && (
        <Text variant="bodySmall" style={{ color: theme.error }}>
          {problem}
        </Text>
      )}
    </View>
  );
}

type Group = 'skip' | 'scan';

// What happened after the last change, with a way to scan if the change still needs one.
function Feedback({
  text,
  stale,
  indexing,
  onRescan,
}: {
  text: string;
  stale: boolean;
  indexing: boolean;
  onRescan: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.feedback, { backgroundColor: theme.surfaceContainerHigh }]}>
      <Text variant="bodySmall" accessibilityLiveRegion="polite">
        {text}
      </Text>
      {stale && (
        <View style={styles.actions}>
          <Button label="Rescan now" icon="refresh" disabled={indexing} onPress={onRescan} />
        </View>
      )}
    </View>
  );
}

function ModeOption({ selected, title, detail, onPress }: { selected: boolean; title: string; detail: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.optionClip, { borderColor: selected ? theme.primary : theme.outlineVariant }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={onPress}
        android_ripple={{ color: theme.outlineVariant }}
        style={styles.option}>
        <Icon
          name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
          size={22}
          color={selected ? theme.primary : theme.onSurfaceVariant}
        />
        <View style={styles.flex}>
          <Text variant="bodyMedium">{title}</Text>
          <Text variant="bodySmall" color="onSurfaceVariant">
            {detail}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export function ScanFolders() {
  const theme = useTheme();
  const store = useSearch();
  const [rules, setRules] = useState<ScanRule[]>([]);
  const [mode, setMode] = useState<ScanMode>('wholePhone');
  // The message about the last change. It is shown under the group that was changed, next to what was tapped.
  const [notice, setNotice] = useState<{ group: Group; text: string } | null>(null);
  // Folder changes that still need a scan to take effect.
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    setRules(await listScanRules().catch(() => [] as ScanRule[]));
    setMode(await getScanMode().catch(() => 'wholePhone' as ScanMode));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Scans again so the change shows up, unless a scan is running already or the first setup is not finished.
  const rescan = useCallback(
    async (message: string, group: Group) => {
      if (store.access !== 'granted' || store.indexing) {
        setStale(true);
        setNotice({ group, text: `${message} Rescan to apply it.` });
        return;
      }
      setStale(false);
      setNotice({ group, text: `${message} Updating the index…` });
      try {
        await store.startScan();
        setNotice({ group, text: `${message} The index is up to date.` });
      } catch {
        setStale(true);
        setNotice({ group, text: `${message} The scan could not run. Try Rescan.` });
      }
    },
    [store],
  );

  const saved = useCallback(async () => {
    const all = await listScanRules();
    setRules(all);
    // The scanner (and background indexing) keeps its own copy of the rules.
    await configureNative().catch(() => undefined);
    return all;
  }, []);

  const addRule = useCallback(
    async (input: string, ruleMode: RuleMode): Promise<string | null> => {
      const result = await addScanRule(input, ruleMode);
      if (!result.ok) return result.reason;
      const all = await saved();
      if (ruleMode === 'exclude') {
        // Hide what is already indexed in that folder straight away; the next scan cleans up the rest.
        const removed = await removeExcludedFromIndex(effectiveExcludes(all)).catch(() => 0);
        void store.refreshCounts();
        setNotice({
          group: 'skip',
          text:
            removed > 0
              ? `Skipping ${result.rule}. ${removed} ${removed === 1 ? 'file' : 'files'} no longer show up in results.`
              : `Skipping ${result.rule}.`,
        });
      } else if (mode === 'selected') {
        void rescan(`Added ${result.rule}.`, 'scan');
      } else {
        setNotice({ group: 'scan', text: `Added ${result.rule}. It will be scanned first.` });
      }
      return null;
    },
    [mode, rescan, saved, store],
  );

  const removeRule = useCallback(
    async (rule: ScanRule) => {
      await removeScanRule(rule.id);
      await saved();
      if (rule.mode === 'exclude') void rescan(`${rule.path} is no longer skipped.`, 'skip');
      else if (mode === 'selected') void rescan(`Removed ${rule.path}.`, 'scan');
      else setNotice({ group: 'scan', text: `Removed ${rule.path}.` });
    },
    [mode, rescan, saved],
  );

  const changeMode = useCallback(
    async (next: ScanMode) => {
      if (next === mode) return;
      if (next === 'selected' && !rules.some((r) => r.mode === 'include')) {
        setNotice({ group: 'scan', text: 'Add at least one folder first, then choose “Only chosen folders”.' });
        return;
      }
      await setScanMode(next);
      setMode(next);
      await saved();
      void rescan(
        next === 'selected' ? 'Now scanning only the chosen folders.' : 'Now scanning the whole phone.',
        'scan',
      );
    },
    [mode, rescan, rules, saved],
  );

  const skipRules = rules.filter((r) => r.mode === 'exclude');
  const chosenRules = rules.filter((r) => r.mode === 'include');
  const skipped = new Set(skipRules.map((r) => r.path.toLowerCase()));
  const quickPicks = QUICK_EXCLUDES.filter((q) => !skipped.has(q.rule.toLowerCase()));

  return (
    <View style={styles.root}>
      <View style={styles.group}>
        <Text variant="titleSmall">Folders to skip</Text>
        <Text variant="bodySmall" color="onSurfaceVariant">
          AiFoundIt never opens these folders, and their files stop showing up in results. A name like Android skips
          every folder with that name. A path like Documents/Private skips just that folder.
        </Text>
        <RuleRow
          icon="lock"
          label="Android/data and Android/obb"
          detail="Always skipped. Other apps keep their files there."
        />
        {skipRules.map((rule) => (
          <RuleRow key={rule.id} icon="folder_off" label={rule.path} onRemove={() => void removeRule(rule)} />
        ))}
        {quickPicks.length > 0 && (
          <View style={styles.group}>
            <Text variant="labelLarge">Quick picks</Text>
            {quickPicks.map((q) => (
              <View key={q.rule} style={[styles.optionClip, { borderColor: theme.outlineVariant }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Skip ${q.label}`}
                  accessibilityHint={q.hint}
                  onPress={() => void addRule(q.rule, 'exclude')}
                  android_ripple={{ color: theme.outlineVariant }}
                  style={styles.option}>
                  <Icon name="add" size={22} color={theme.onSurfaceVariant} />
                  <View style={styles.flex}>
                    <Text variant="bodyMedium">{q.label}</Text>
                    <Text variant="bodySmall" color="onSurfaceVariant">
                      {q.hint}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <FolderAdder placeholder="Android, or Documents/Private" onAdd={(input) => addRule(input, 'exclude')} />
        {notice?.group === 'skip' && (
          <Feedback
            text={notice.text}
            stale={stale}
            indexing={store.indexing}
            onRescan={() => void rescan('Scanning.', 'skip')}
          />
        )}
      </View>

      <View style={[styles.group, styles.divided, { borderTopColor: theme.outlineVariant }]}>
        <Text variant="titleSmall">What to scan</Text>
        <View accessibilityRole="radiogroup" style={styles.group}>
          <ModeOption
            selected={mode === 'wholePhone'}
            title="The whole phone"
            detail="Everything except the skipped folders. Chosen folders are scanned first."
            onPress={() => void changeMode('wholePhone')}
          />
          <ModeOption
            selected={mode === 'selected'}
            title="Only chosen folders"
            detail="Nothing outside the folders below is scanned."
            onPress={() => void changeMode('selected')}
          />
        </View>
        <Text variant="labelLarge">Chosen folders</Text>
        {chosenRules.length === 0 && (
          <Text variant="bodySmall" color="onSurfaceVariant">
            No folders chosen yet.
          </Text>
        )}
        {chosenRules.map((rule) => (
          <RuleRow key={rule.id} icon="folder" label={rule.path} onRemove={() => void removeRule(rule)} />
        ))}
        <FolderAdder placeholder="DCIM/Camera" onAdd={(input) => addRule(input, 'include')} />
        {notice?.group === 'scan' && (
          <Feedback
            text={notice.text}
            stale={stale}
            indexing={store.indexing}
            onRescan={() => void rescan('Scanning.', 'scan')}
          />
        )}
      </View>

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
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.four,
  },
  flex: {
    flex: 1,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },

  feedback: {
    gap: Spacing.two,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  adder: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  optionClip: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 56,
  },
});
