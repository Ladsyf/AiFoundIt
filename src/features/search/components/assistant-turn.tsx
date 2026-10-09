import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { FileCard } from '@/features/search/components/file-card';
import { FilePlanCard } from '@/features/search/components/file-plan-card';
import type { AssistantMessage, FileItem, SearchResult } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

const INITIAL_VISIBLE = 4;

type Props = {
  message: AssistantMessage;
  fileById: (id: string) => FileItem | undefined;
  onOpenFile: (result: SearchResult) => void;
  onConfirmPlan: () => void;
  onCancelPlan: () => void;
  onToggleOp: (opId: string) => void;
};

const enter = FadeInDown.duration(280).easing(Easing.out(Easing.exp));

function pairs<T>(items: T[]) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function TotalCard({ total }: { total: NonNullable<AssistantMessage['total']> }) {
  const theme = useTheme();
  const peso = `₱${total.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return (
    <View style={[styles.totalCard, { backgroundColor: theme.primaryContainer }]}>
      <Text variant="titleLarge" color="onPrimaryContainer">
        {peso}
      </Text>
      <Text variant="bodyMedium" color="onPrimaryContainer">
        {total.count} receipt{total.count === 1 ? '' : 's'}
        {total.merchant ? ` · ${total.merchant}` : ''} · summed in code
      </Text>
    </View>
  );
}

export function AssistantTurn({ message, fileById, onOpenFile, onConfirmPlan, onCancelPlan, onToggleOp }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? undefined : enter;
  const [expanded, setExpanded] = useState(false);

  if (message.status === 'searching' && message.results.length === 0) {
    return (
      <View style={styles.searching} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={theme.primary} />
        <Text variant="bodyMedium" color="onSurfaceVariant">
          Searching this phone…
        </Text>
      </View>
    );
  }

  const visible = expanded ? message.results : message.results.slice(0, INITIAL_VISIBLE);
  const hidden = message.results.length - visible.length;

  return (
    <View style={styles.turn}>
      {visible.length > 0 && (
        <Animated.View entering={entering} style={styles.grid}>
          {pairs(visible).map((row) => (
            <View key={row[0].fileId} style={styles.row}>
              {row.map((result) => {
                const file = fileById(result.fileId);
                return (
                  <View key={result.fileId} style={styles.cell}>
                    {file && <FileCard file={file} onPress={() => onOpenFile(result)} />}
                  </View>
                );
              })}
              {row.length === 1 && <View style={styles.cell} />}
            </View>
          ))}
        </Animated.View>
      )}

      {hidden > 0 && (
        <View style={styles.more}>
          <Button label={`Show ${hidden} more`} variant="text" onPress={() => setExpanded(true)} />
        </View>
      )}

      {message.total && <TotalCard total={message.total} />}

      {message.proposal && (
        <Animated.View entering={entering}>
          <FilePlanCard
            plan={message.proposal}
            fileById={fileById}
            onConfirm={onConfirmPlan}
            onCancel={onCancelPlan}
            onToggle={onToggleOp}
          />
        </Animated.View>
      )}

      {message.text ? (
        <Text variant="bodyLarge" accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : message.status === 'streaming' ? (
        <ActivityIndicator size="small" color={theme.primary} style={styles.selfStart} />
      ) : null}

      {message.partialIndex && (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Still indexing, so some files may not show up yet.
        </Text>
      )}

      {message.proof && (
        <View style={styles.proof}>
          <Icon name="lock" size={14} color={theme.onSurfaceVariant} />
          <Text variant="bodySmall" color="onSurfaceVariant">
            {message.proof}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  turn: {
    gap: Spacing.three,
  },
  grid: {
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cell: {
    flex: 1,
  },
  more: {
    alignItems: 'flex-start',
    marginLeft: -Spacing.three,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  totalCard: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.half,
  },
  proof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
