import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ModelsPanel } from '@/features/models/models-panel';
import { useModels } from '@/features/models/models-store';
import { formatModelSize } from '@/lib/download-view';
import { MODEL_CATALOG, recommendedPair } from '@/lib/model-catalog';

type Props = {
  stepLabel: string;
  onContinue: () => void;
};

// First-run step: pick and download the AI models, then start scanning.
export function ModelsStep({ stepLabel, onContinue }: Props) {
  const m = useModels();
  const pair = recommendedPair(m.device?.totalRamBytes);
  const wanted = [pair.embedder, pair.llm].filter(
    (model) => !m.installed.some((i) => i.catalogId === model.id && !i.partial) && !m.downloads[model.id],
  );
  const wantedBytes = wanted.reduce((sum, model) => sum + model.sizeBytes, 0);
  const searchModelBusy = MODEL_CATALOG.some(
    (model) => model.role === 'embedder' && m.downloads[model.id]?.state === 'downloading',
  );
  const anyBusy = Object.values(m.downloads).some((d) => d.state === 'downloading');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text variant="bodySmall" color="onSurfaceVariant">
        {stepLabel}
      </Text>
      <Text variant="headlineSmall" accessibilityRole="header">
        Choose the AI models
      </Text>
      <Text variant="bodyMedium" color="onSurfaceVariant">
        AiFoundIt runs on this phone, so it needs two models. Download them once, ideally on Wi-Fi, and it works
        without a connection after that. Nothing about your files is sent anywhere.
      </Text>

      {wanted.length > 0 && (
        <View style={styles.row}>
          <Button
            label={`Download recommended · ${formatModelSize(wantedBytes)}`}
            icon="download"
            onPress={() => wanted.forEach((model) => void m.download(model))}
            accessibilityHint="Downloads the search model and the chat model that suit this phone"
          />
        </View>
      )}

      <ModelsPanel />

      <View style={styles.footer}>
        {searchModelBusy ? (
          <>
            <Button label="Downloading the search model…" disabled onPress={onContinue} />
            <Button label="Scan without it" variant="text" onPress={onContinue} />
          </>
        ) : (
          <Button label="Continue" onPress={onContinue} />
        )}
        <Text variant="bodySmall" color="onSurfaceVariant" style={styles.centered}>
          {anyBusy
            ? 'Downloads continue while AiFoundIt stays open.'
            : m.active.embedder
              ? ''
              : 'Without a search model only the exact words in your files are matched. You can add one later in Settings.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
});
