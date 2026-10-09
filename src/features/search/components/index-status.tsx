import { StyleSheet, View } from 'react-native';

import { LinearProgress } from '@/components/ui/linear-progress';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

const number = new Intl.NumberFormat('en-GB');

type Props = {
  indexed: number;
  total: number;
  backend?: string;
};

export function IndexStatus({ indexed, total, backend }: Props) {
  const label =
    total > 0
      ? `Indexing files on this phone · ${number.format(indexed)} of ${number.format(total)}`
      : 'Indexing files on this phone…';
  return (
    <View style={styles.container}>
      <LinearProgress value={total > 0 ? indexed / total : 0} label={label} />
      <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
        {label}
        {backend ? ` · ${backend}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
});
