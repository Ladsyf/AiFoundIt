import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Snackbar } from '@/components/ui/snackbar';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AssistantTurn } from '@/features/search/components/assistant-turn';
import { Composer } from '@/features/search/components/composer';
import { FileSheet } from '@/features/search/components/file-sheet';
import { IndexStatus } from '@/features/search/components/index-status';
import { TopAppBar } from '@/features/search/components/top-app-bar';
import { UserBubble } from '@/features/search/components/user-bubble';
import { AccessRequest, Suggestions } from '@/features/search/components/welcome';
import { useSearch } from '@/features/search/store';
import type { Message, SearchResult } from '@/features/search/types';
import { useTheme } from '@/hooks/use-theme';

export function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<Message>>(null);
  const [opened, setOpened] = useState<SearchResult | null>(null);
  const reduceMotion = useReducedMotion();
  const store = useSearch();
  const conversation = store.activeConversation;
  const messages = conversation?.messages ?? [];
  const granted = store.access === 'granted';
  const last = messages.at(-1);
  const lastKey = last ? `${last.id}:${last.role === 'assistant' ? last.status : ''}` : '';

  useEffect(() => {
    if (!lastKey) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: !reduceMotion }), 450);
    return () => clearTimeout(timer);
  }, [lastKey, reduceMotion]);

  const send = (text: string) => {
    Keyboard.dismiss();
    store.send(text);
  };

  const renderItem = ({ item }: { item: Message }) =>
    item.role === 'user' ? (
      <UserBubble text={item.text} />
    ) : (
      <AssistantTurn
        message={item}
        fileById={store.fileById}
        onOpenFile={setOpened}
        onConfirmMove={() => conversation && store.confirmMove(conversation.id, item.id)}
        onCancelMove={() => conversation && store.cancelMove(conversation.id, item.id)}
      />
    );

  return (
    <View style={[styles.root, { backgroundColor: theme.surface, paddingTop: insets.top }]}>
      <TopAppBar
        title={conversation?.title ?? 'AiFoundIt'}
        onOpenMenu={() => navigation.dispatch(DrawerActions.openDrawer())}
        onNewChat={store.newChat}
        canStartNew={conversation !== null}
      />
      {granted && store.indexed < store.indexTotal && (
        <IndexStatus indexed={store.indexed} total={store.indexTotal} />
      )}

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.content}>
          {!granted ? (
            <AccessRequest onAllow={store.grantAccess} />
          ) : messages.length === 0 ? (
            <Suggestions onPick={send} />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !reduceMotion })}
            />
          )}
        </View>

        <View style={styles.snackbarSlot} pointerEvents="box-none">
          {store.snackbar && <Snackbar message={store.snackbar} onDismiss={store.dismissSnackbar} />}
        </View>

        <View style={[styles.composer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Composer onSend={send} disabled={!granted} />
        </View>
      </KeyboardAvoidingView>

      <FileSheet
        file={opened ? (store.fileById(opened.fileId) ?? null) : null}
        reason={opened?.reason ?? ''}
        onClose={() => setOpened(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  snackbarSlot: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  composer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
