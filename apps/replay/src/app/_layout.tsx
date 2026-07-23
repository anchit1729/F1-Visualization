import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppHeader from '../components/ui/AppHeader';
import { AppThemeProvider, useAppTheme } from '../theme/useAppTheme';
import { LiquidGlassProvider, useLiquidGlass } from '../theme/useLiquidGlass';

export default function RootLayout() {
  return (
    <LiquidGlassProvider>
      <ThemedApp />
    </LiquidGlassProvider>
  );
}

function ThemedApp() {
  const useGlass = useLiquidGlass();

  return (
    <AppThemeProvider appearance={useGlass ? 'dark' : undefined}>
      <AppFrame />
    </AppThemeProvider>
  );
}

function AppFrame() {
  const theme = useAppTheme();
  const useGlass = useLiquidGlass();
  const backgroundColor = useGlass
    ? theme.liquidGlass.backgroundColor
    : theme.colors.background;
  const navigationTheme = useMemo(() => {
    const baseTheme = theme.mode === 'dark' ? DarkTheme : DefaultTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: backgroundColor,
        border: theme.colors.border,
        card: theme.colors.surface,
        notification: theme.colors.danger,
        primary: theme.colors.accent,
        text: theme.colors.text,
      },
    };
  }, [backgroundColor, theme]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <View style={[styles.app, { backgroundColor }]}>
          <AppHeader />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor },
              headerShown: false,
            }}
          />
          <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
});
