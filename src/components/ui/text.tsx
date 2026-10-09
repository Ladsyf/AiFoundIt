import { Text as RNText, type TextProps } from 'react-native';

import { type ColorRole, Type, type TypeRole } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextProps & {
  variant?: TypeRole;
  color?: ColorRole;
};

export function Text({ variant = 'bodyLarge', color = 'onSurface', style, ...rest }: Props) {
  const theme = useTheme();
  return <RNText style={[Type[variant], { color: theme[color] }, style]} {...rest} />;
}
