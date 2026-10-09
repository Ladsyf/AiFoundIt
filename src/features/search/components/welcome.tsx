import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSearch } from '@/features/search/store';
import { useTheme } from '@/hooks/use-theme';
import { detectModelConfig, importModelFile, isMockNative } from '@/lib/models';
import { native } from '@/lib/native';

const SUGGESTIONS: { icon: IconName; text: string }[] = [
  { icon: 'screenshot', text: 'The screenshot with the wifi password' },
  { icon: 'receipt_long', text: 'Nasaan yung resibo ko sa Jollibee?' },
  { icon: 'description', text: 'The PDF about the thesis defense schedule' },
  { icon: 'photo', text: 'beach photo' },
  { icon: 'receipt_long', text: 'Magkano nagastos ko sa GCash this week?' },
  { icon: 'drive_file_move', text: 'Ilagay mo lahat ng resibo sa isang folder' },
];

const MEDIA_PERMISSIONS: Parameters<typeof PermissionsAndroid.requestMultiple>[0] = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
];

type Step = 'media' | 'allFiles' | 'models' | 'scan';

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: done ? theme.primary : active ? theme.primaryContainer : theme.surfaceContainerHigh },
      ]}
    />
  );
}

async function requestMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.requestMultiple(MEDIA_PERMISSIONS);
    const mediaOk =
      result['android.permission.READ_MEDIA_IMAGES'] === PermissionsAndroid.RESULTS.GRANTED ||
      result['android.permission.READ_EXTERNAL_STORAGE'] === PermissionsAndroid.RESULTS.GRANTED;
    return mediaOk || Object.values(result).some((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return true;
  }
}

export function AccessRequest() {
  const theme = useTheme();
  const store = useSearch();
  const [step, setStep] = useState<Step>(isMockNative ? 'models' : 'media');
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<{ embedder: boolean; llm: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);

  const checkModels = useCallback(async () => {
    const { config } = await detectModelConfig();
    setModels({ embedder: config.embedderPath !== null, llm: config.llmPath !== null });
  }, []);

  const toModels = useCallback(() => {
    setStep('models');
    void checkModels();
  }, [checkModels]);

  useEffect(() => {
    if (step !== 'allFiles') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        if (native.hasAllFilesAccess()) toModels();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [step, toModels]);

  const allowMedia = async () => {
    setBusy(true);
    try {
      const ok = await requestMediaPermissions();
      if (ok) {
        if (native.hasAllFilesAccess()) toModels();
        else setStep('allFiles');
      } else {
        setNote('Without media access AiFoundIt can only search documents you pick. You can change this in Settings.');
        setStep('allFiles');
      }
    } finally {
      setBusy(false);
    }
  };

  const skipAllFiles = () => {
    setNote('Skipped. Photos, videos and audio will still be indexed; documents need All files access.');
    toModels();
  };

  const importModel = async () => {
    setBusy(true);
    try {
      const file = await importModelFile();
      if (file) {
        setNote(`Imported ${file.name}`);
        await checkModels();
      }
    } catch {
      setNote('Import failed — you can also push the model with adb.');
    } finally {
      setBusy(false);
    }
  };

  const beginScan = async () => {
    setStep('scan');
    store.grantAccess();
    try {
      await store.startScan();
    } catch {
      setNote('The scan failed. You can rescan from Settings.');
    }
  };

  const steps: Step[] = isMockNative ? ['models', 'scan'] : ['media', 'allFiles', 'models', 'scan'];

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

      <View style={styles.dots}>
        {steps.map((s) => (
          <StepDot key={s} active={s === step} done={steps.indexOf(s) < steps.indexOf(step)} />
        ))}
      </View>

      {step === 'media' && (
        <View style={styles.stepBody}>
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.centerText}>
            Step 1 of 4 — allow AiFoundIt to see your photos, videos and audio.
          </Text>
          <Button label="Allow media access" onPress={() => void allowMedia()} />
        </View>
      )}

      {step === 'allFiles' && (
        <View style={styles.stepBody}>
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.centerText}>
            Step 2 of 4 — “All files access” lets AiFoundIt read PDFs and documents anywhere on the phone.
          </Text>
          <Button label="Open settings" onPress={() => void native.openAllFilesAccessSettings()} />
          <Button label="Skip for now" variant="text" onPress={skipAllFiles} />
        </View>
      )}

      {step === 'models' && (
        <View style={styles.stepBody}>
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.centerText}>
            {isMockNative
              ? 'Running without the native module — search uses keywords and basic vectors.'
              : 'Step 3 of 4 — on-device models. Import the .litertlm files pushed to this phone, or continue without them.'}
          </Text>
          {models && !isMockNative && (
            <Text variant="bodySmall" color="onSurfaceVariant" style={styles.centerText}>
              {models.embedder ? 'Embedder found. ' : 'No embedder model. '}
              {models.llm ? 'Chat model found.' : 'No chat model — answers will be templated.'}
            </Text>
          )}
          <Button label="Import model file" variant="tonal" icon="download" onPress={() => void importModel()} />
          <Button label={busy ? 'Working…' : 'Continue'} onPress={() => void beginScan()} />
        </View>
      )}

      {step === 'scan' && (
        <View style={styles.stepBody}>
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.centerText}>
            Scanning this phone — priority folders first. Search works as soon as the first files land.
          </Text>
          <Button label="Start searching" variant="tonal" onPress={store.grantAccess} />
        </View>
      )}

      {note && (
        <Text variant="bodySmall" color="onSurfaceVariant" style={[styles.centerText, styles.measure]}>
          {note}
        </Text>
      )}
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
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepBody: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  suggestions: {
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
