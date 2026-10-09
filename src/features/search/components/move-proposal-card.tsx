import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { FileItem, MoveProposal } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

const PREVIEW_COUNT = 3;

type Props = {
  proposal: MoveProposal;
  files: FileItem[];
  onConfirm: () => void;
  onCancel: () => void;
};

const STATUS: Record<Exclude<MoveProposal['state'], 'pending'>, (p: MoveProposal) => string> = {
  moved: (p) => `Moved ${p.fileIds.length} files to ${p.to}.`,
  cancelled: () => 'Nothing was moved.',
  undone: (p) => `Undone. The files are back in ${p.from}.`,
};

export function MoveProposalCard({ proposal, files, onConfirm, onCancel }: Props) {
  const theme = useTheme();
  const remaining = files.length - PREVIEW_COUNT;

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceContainerLow, borderColor: theme.outlineVariant }]}>
      <View style={styles.header}>
        <Icon name="drive_file_move" color={theme.primary} />
        <Text variant="titleMedium" style={styles.flex}>
          Move {files.length} receipts to {proposal.to}?
        </Text>
      </View>

      <View style={styles.list}>
        {files.slice(0, PREVIEW_COUNT).map((f) => (
          <Text key={f.id} variant="bodyMedium" color="onSurfaceVariant" numberOfLines={1}>
            {f.name}
          </Text>
        ))}
        {remaining > 0 && (
          <Text variant="bodyMedium" color="onSurfaceVariant">
            and {remaining} more
          </Text>
        )}
      </View>

      {proposal.state === 'pending' ? (
        <>
          <Text variant="bodySmall" color="onSurfaceVariant">
            Nothing is deleted. You can undo the move.
          </Text>
          <View style={styles.actions}>
            <Button label="Cancel" variant="text" onPress={onCancel} />
            <Button label={`Move ${files.length} files`} onPress={onConfirm} />
          </View>
        </>
      ) : (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Icon
            name={proposal.state === 'moved' ? 'check_circle' : 'info'}
            size={20}
            color={proposal.state === 'moved' ? theme.primary : theme.onSurfaceVariant}
          />
          <Text variant="bodyMedium" style={styles.flex}>
            {STATUS[proposal.state](proposal)}
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
    paddingLeft: 36,
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
