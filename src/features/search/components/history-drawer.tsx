import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useSearch } from '@/features/search/store';
import type { Conversation } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

function relativeDay(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversations, activeId, newChat, openConversation } = useSearch();

  const select = (id: string) => {
    openConversation(id);
    onClose();
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const selected = item.id === activeId;
    return (
      <View style={styles.itemClip}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => select(item.id)}
          android_ripple={{ color: theme.outlineVariant }}
          style={[styles.item, selected && { backgroundColor: theme.secondaryContainer }]}>
          <Text
            variant="labelLarge"
            color={selected ? 'onSecondaryContainer' : 'onSurface'}
            numberOfLines={1}
            style={styles.flex}>
            {item.title}
          </Text>
          <Text variant="labelMedium" color={selected ? 'onSecondaryContainer' : 'onSurfaceVariant'}>
            {relativeDay(item.updatedAt)}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]}>
      <Text variant="titleSmall" color="onSurfaceVariant" style={styles.brand}>
        AiFoundIt
      </Text>
      <View style={styles.newChat}>
        <Button
          label="New search"
          icon="edit_square"
          variant="tonal"
          onPress={() => {
            newChat();
            onClose();
          }}
        />
      </View>

      <Text variant="titleSmall" color="onSurfaceVariant" style={styles.section}>
        Recent
      </Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text variant="bodyMedium" color="onSurfaceVariant" style={styles.empty}>
            Your searches will appear here.
          </Text>
        }
      />

      <View style={styles.newChat}>
        <Button
          label="Settings"
          icon="settings"
          variant="text"
          onPress={() => {
            onClose();
            router.push('/settings');
          }}
        />
      </View>

      <View style={[styles.footer, { borderTopColor: theme.outlineVariant }]}>
        <Icon name="lock" size={18} color={theme.onSurfaceVariant} />
        <Text variant="bodySmall" color="onSurfaceVariant" style={styles.flex}>
          Searches stay on this phone. Nothing is uploaded.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  brand: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  newChat: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.four,
  },
  section: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  list: {
    gap: Spacing.half,
  },
  itemClip: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  item: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  flex: {
    flex: 1,
  },
  empty: {
    paddingHorizontal: Spacing.four,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
