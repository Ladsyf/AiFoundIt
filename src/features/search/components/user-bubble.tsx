import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function UserBubble({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.bubble, { backgroundColor: theme.surfaceContainerHigh }]}>
      <Text variant="bodyLarge">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    borderRadius: Radius.large + 4,
    borderBottomRightRadius: Radius.small - 4,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
