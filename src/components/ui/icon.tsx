import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';

type SymbolName = Exclude<ComponentProps<typeof SymbolView>['name'], string>;

export type IconName = NonNullable<SymbolName['android']>;

type Props = {
  name: IconName;
  ios?: SymbolName['ios'];
  size?: number;
  color: string;
};

export function Icon({ name, ios, size = 24, color }: Props) {
  return (
    <SymbolView
      name={{ android: name, web: name, ios }}
      size={size}
      tintColor={color}
      style={{ width: size, height: size }}
    />
  );
}
