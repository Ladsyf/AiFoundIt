import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { FileItem, FilePlan } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

const PREVIEW_COUNT = 6;

type Props = {
  plan: FilePlan;
  fileById: (id: string) => FileItem | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  onToggle: (opId: string) => void;
};

const STATUS: Record<Exclude<FilePlan['state'], 'pending'>, (p: FilePlan) => string> = {
  moved: (p) => `Moved ${p.ops.filter((o) => o.checked).length} files to ${p.destination}.`,
  cancelled: () => 'Nothing was moved.',
  undone: (p) => `Undone. The files are back where they were.`,
};

function baseName(path: string) {
  return path.split('/').pop() ?? path;
}

export function FilePlanCard({ plan, fileById, onConfirm, onCancel, onToggle }: Props) {
  const theme = useTheme();
  const checked = plan.ops.filter((o) => o.checked);
  const remaining = plan.ops.length - PREVIEW_COUNT;

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceContainerLow, borderColor: theme.outlineVariant }]}>
      <View style={styles.header}>
        <Icon name="drive_file_move" color={theme.primary} />
        <Text variant="titleMedium" style={styles.flex}>
          Move {checked.length} of {plan.ops.length} files to {plan.destination}?
        </Text>
      </View>

      <View style={styles.list}>
        {plan.ops.slice(0, PREVIEW_COUNT).map((op) => {
          const file = fileById(op.fileId);
          return (
            <View key={op.id} style={styles.opRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: op.checked }}
                accessibilityLabel={`Include ${file?.name ?? baseName(op.from)}`}
                disabled={plan.state !== 'pending'}
                onPress={() => onToggle(op.id)}
                style={styles.opPress}
                android_ripple={{ color: theme.outlineVariant, borderless: true }}>
                <Icon
                  name={op.checked ? 'check_box' : 'check_box_outline_blank'}
                  size={20}
                  color={op.checked ? theme.primary : theme.onSurfaceVariant}
                />
                <Text variant="bodyMedium" color="onSurfaceVariant" numberOfLines={1} style={styles.flex}>
                  {file?.name ?? baseName(op.from)}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {remaining > 0 && (
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.more}>
            and {remaining} more
          </Text>
        )}
      </View>

      {plan.state === 'pending' ? (
        <>
          <Text variant="bodySmall" color="onSurfaceVariant">
            Nothing is deleted. You can undo the move.
          </Text>
          <View style={styles.actions}>
            <Button label="Cancel" variant="text" onPress={onCancel} />
            <Button
              label={`Move ${checked.length} files`}
              onPress={onConfirm}
              accessibilityHint={`Creates ${plan.destination} and moves the ticked files`}
            />
          </View>
        </>
      ) : (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Icon
            name={plan.state === 'moved' ? 'check_circle' : 'info'}
            size={20}
            color={plan.state === 'moved' ? theme.primary : theme.onSurfaceVariant}
          />
          <Text variant="bodyMedium" style={styles.flex}>
            {STATUS[plan.state](plan)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.half,
  },
  opRow: {
    marginLeft: 32,
  },
  opPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
  },
  more: {
    marginLeft: 32,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
