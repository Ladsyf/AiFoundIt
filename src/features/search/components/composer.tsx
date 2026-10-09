import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function Composer({ onSend, disabled }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const canSend = !disabled && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceContainerHigh }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        editable={!disabled}
        placeholder={disabled ? 'Allow file access to start' : 'Describe a file'}
        placeholderTextColor={theme.onSurfaceVariant}
        selectionColor={theme.primary}
        cursorColor={theme.primary}
        accessibilityLabel="Describe a file"
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        onSubmitEditing={submit}
        style={[Type.bodyLarge, styles.input, { color: theme.onSurface }]}
      />
      <IconButton icon="arrow_upward" label="Send" filled disabled={!canSend} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: Radius.extraLarge,
    paddingLeft: Spacing.five,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
    minHeight: 56,
  },
  input: {
    flex: 1,
    maxHeight: 128,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'center',
  },
});
