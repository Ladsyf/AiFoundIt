import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import symbolsRegular from 'expo-symbols/androidWeights/regular';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HistoryDrawer } from '@/features/search/components/history-drawer';
import { SearchProvider } from '@/features/search/store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

const ICON_FONTS = { [symbolsRegular.name]: symbolsRegular.font };

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const [iconsLoaded, iconsError] = useFonts(ICON_FONTS);
  const ready = iconsLoaded || iconsError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            primary: theme.primary,
            background: theme.surface,
            card: theme.surfaceContainerLow,
            text: theme.onSurface,
            border: theme.outlineVariant,
          },
        }}>
        <SearchProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Drawer
            drawerContent={({ navigation }) => <HistoryDrawer onClose={() => navigation.closeDrawer()} />}
            screenOptions={{
              headerShown: false,
              drawerType: 'front',
              overlayColor: theme.scrim,
              drawerStyle: {
                backgroundColor: theme.surfaceContainerLow,
                borderTopRightRadius: 16,
                borderBottomRightRadius: 16,
                width: 320,
              },
            }}>
            <Drawer.Screen name="index" />
          </Drawer>
        </SearchProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
