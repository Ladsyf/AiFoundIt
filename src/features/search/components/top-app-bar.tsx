import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

type Props = {
  title: string;
  onOpenMenu: () => void;
  onNewChat: () => void;
  canStartNew: boolean;
};

export function TopAppBar({ title, onOpenMenu, onNewChat, canStartNew }: Props) {
  return (
    <View style={styles.bar}>
      <IconButton icon="menu" label="Open search history" onPress={onOpenMenu} />
      <Text variant="titleLarge" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <IconButton icon="edit_square" label="New search" onPress={onNewChat} disabled={!canStartNew} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    gap: Spacing.one,
  },
  title: {
    flex: 1,
  },
});
