import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="titleSmall" color="onSurfaceVariant" accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.surfaceContainerLow, borderColor: theme.outlineVariant }]}>
        {children}
      </View>
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodyMedium" color="onSurfaceVariant">
        {value}
      </Text>
    </View>
  );
}

type SwitchRowProps = {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, hint, value, onChange, disabled = false }: SwitchRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{label}</Text>
        {hint && (
          <Text variant="bodySmall" color="onSurfaceVariant">
            {hint}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: theme.surfaceContainerHighest, true: theme.primary }}
        thumbColor={value ? theme.onPrimary : theme.outline}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
