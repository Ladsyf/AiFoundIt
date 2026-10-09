import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { FilePreview } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  preview: FilePreview;
  large?: boolean;
};

export function FileThumbnail({ preview, large }: Props) {
  const theme = useTheme();
  const scale = large ? 1.35 : 1;
  const limit = large ? undefined : 2;
  const tiny = { fontSize: 10 * scale, lineHeight: 13 * scale };
  const strong = { fontSize: 11 * scale, lineHeight: 14 * scale, fontWeight: '600' as const };

  switch (preview.kind) {
    case 'screenshot':
      return (
        <View style={[styles.frame, { backgroundColor: theme.surfaceContainerHigh }]}>
          <Text variant="bodySmall" color="onSurfaceVariant" style={tiny} numberOfLines={1}>
            {preview.app}
          </Text>
          <Text variant="bodySmall" style={[strong, styles.gapBelow]} numberOfLines={1}>
            {preview.title}
          </Text>
          {preview.rows.slice(0, limit).map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text variant="bodySmall" color="onSurfaceVariant" style={tiny} numberOfLines={1}>
                {label}
              </Text>
              <Text variant="bodySmall" style={strong} numberOfLines={1}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'receipt':
      return (
        <View style={[styles.frame, styles.paper, { backgroundColor: theme.surfaceContainerLow }]}>
          <Text variant="bodySmall" style={[strong, styles.gapBelow]} numberOfLines={1}>
            {preview.merchant}
          </Text>
          {preview.items.slice(0, limit).map(([item, price]) => (
            <View key={item} style={styles.receiptRow}>
              <Text variant="bodySmall" color="onSurfaceVariant" style={[tiny, styles.flex]} numberOfLines={1}>
                {item}
              </Text>
              <Text variant="bodySmall" color="onSurfaceVariant" style={tiny}>
                {price}
              </Text>
            </View>
          ))}
          <View style={[styles.receiptRow, styles.total, { borderTopColor: theme.outlineVariant }]}>
            <Text variant="bodySmall" style={[strong, styles.flex]}>
              Total
            </Text>
            <Text variant="bodySmall" style={strong}>
              {preview.total}
            </Text>
          </View>
        </View>
      );
    case 'document':
      return (
        <View style={[styles.frame, styles.paper, { backgroundColor: theme.surfaceContainerLow }]}>
          <Text variant="bodySmall" style={[strong, styles.gapBelow]} numberOfLines={2}>
            {preview.title}
          </Text>
          {preview.lines.slice(0, large ? undefined : 3).map((line) => (
            <Text key={line} variant="bodySmall" color="onSurfaceVariant" style={tiny} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      );
    case 'photo':
      return (
        <View style={[styles.frame, styles.photo, { backgroundColor: preview.tone }]}>
          <Icon name="photo" size={28 * scale} color="rgba(255,255,255,0.9)" />
          <Text variant="bodySmall" style={[tiny, styles.photoCaption]} numberOfLines={2}>
            {preview.subject}
          </Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    borderRadius: Radius.small,
    padding: Spacing.three,
    gap: Spacing.half,
    overflow: 'hidden',
  },
  paper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  gapBelow: {
    marginBottom: Spacing.one,
  },
  row: {
    marginTop: Spacing.one,
  },
  receiptRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  total: {
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: {
    flex: 1,
  },
  photo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCaption: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: Spacing.one,
  },
});
