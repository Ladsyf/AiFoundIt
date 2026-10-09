import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SnackbarMessage = {
  id: string;
  text: string;
  action?: { label: string; onPress: () => void };
};

const DURATION_MS = 6000;

export function Snackbar({ message, onDismiss }: { message: SnackbarMessage; onDismiss: () => void }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onDismiss, DURATION_MS);
    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200).easing(Easing.out(Easing.exp))}
      exiting={reduceMotion ? undefined : FadeOut.duration(150)}
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: theme.inverseSurface }]}>
      <Text variant="bodyMedium" style={[styles.text, { color: theme.inverseOnSurface }]}>
        {message.text}
      </Text>
      {message.action && (
        <View style={styles.actionClip}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              message.action?.onPress();
              onDismiss();
            }}
            android_ripple={{ color: theme.inversePrimary + '33' }}
            style={styles.action}>
            <Text variant="labelLarge" style={{ color: theme.inversePrimary }}>
              {message.action.label}
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    borderRadius: Radius.small,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.four,
    paddingRight: Spacing.one,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  text: {
    flex: 1,
    paddingVertical: Spacing.three,
  },
  actionClip: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  action: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
});
