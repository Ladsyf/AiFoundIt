import { StyleSheet, View } from 'react-native';

import { LinearProgress } from '@/components/ui/linear-progress';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

const number = new Intl.NumberFormat('en-GB');

export function IndexStatus({ indexed, total }: { indexed: number; total: number }) {
  const label = `Indexing files on this phone · ${number.format(indexed)} of ${number.format(total)}`;
  return (
    <View style={styles.container}>
      <LinearProgress value={indexed / total} label={label} />
      <Text variant="bodySmall" color="onSurfaceVariant" importantForAccessibility="no">
        {label}
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
