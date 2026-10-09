import { Platform, type TextStyle } from 'react-native';

export const Colors = {
  light: {
    primary: '#8B5000',
    onPrimary: '#FFFFFF',
    primaryContainer: '#FFDCBE',
    onPrimaryContainer: '#2C1600',
    secondaryContainer: '#F1E0D2',
    onSecondaryContainer: '#2A1A0E',
    surface: '#FBFAF8',
    surfaceContainerLow: '#F5F3F0',
    surfaceContainer: '#EFECE8',
    surfaceContainerHigh: '#E9E5E0',
    surfaceContainerHighest: '#E2DED8',
    onSurface: '#1D1B19',
    onSurfaceVariant: '#57524C',
    outline: '#857F78',
    outlineVariant: '#D8D2CB',
    inverseSurface: '#33302D',
    inverseOnSurface: '#F6F0EA',
    inversePrimary: '#FFB870',
    error: '#BA1A1A',
    scrim: 'rgba(0,0,0,0.32)',
  },
  dark: {
    primary: '#FFB870',
    onPrimary: '#4A2800',
    primaryContainer: '#6A3C00',
    onPrimaryContainer: '#FFDCBE',
    secondaryContainer: '#4A3A2D',
    onSecondaryContainer: '#F1E0D2',
    surface: '#151311',
    surfaceContainerLow: '#1D1B19',
    surfaceContainer: '#221F1D',
    surfaceContainerHigh: '#2C2927',
    surfaceContainerHighest: '#373431',
    onSurface: '#E9E2DC',
    onSurfaceVariant: '#CFC6BD',
    outline: '#999088',
    outlineVariant: '#4A4540',
    inverseSurface: '#E9E2DC',
    inverseOnSurface: '#33302D',
    inversePrimary: '#8B5000',
    error: '#FFB4AB',
    scrim: 'rgba(0,0,0,0.5)',
  },
} as const;

export type ColorRole = keyof typeof Colors.light;
export type Palette = { [K in ColorRole]: string };

const family = Platform.select({ android: 'sans-serif', default: undefined });
const medium = Platform.select({ android: 'sans-serif-medium', default: undefined });

export const Type = {
  headlineSmall: { fontFamily: family, fontSize: 24, lineHeight: 32, fontWeight: '400' },
  titleLarge: { fontFamily: family, fontSize: 22, lineHeight: 28, fontWeight: '400' },
  titleMedium: { fontFamily: medium, fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: 0.15 },
  titleSmall: { fontFamily: medium, fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1 },
  bodyLarge: { fontFamily: family, fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0.25 },
  bodyMedium: { fontFamily: family, fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0.25 },
  bodySmall: { fontFamily: family, fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0.4 },
  labelLarge: { fontFamily: medium, fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1 },
  labelMedium: { fontFamily: medium, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
} satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof Type;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 999,
} as const;

export const MaxContentWidth = 720;
