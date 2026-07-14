import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppHeader from '../components/ui/AppHeader';
import { AppThemeProvider, useAppTheme } from '../theme/useAppTheme';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AppFrame />
    </AppThemeProvider>
  );
}

function AppFrame() {
  const theme = useAppTheme();
  const navigationTheme = useMemo(() => {
    const baseTheme = theme.mode === 'dark' ? DarkTheme : DefaultTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: theme.colors.background,
        border: theme.colors.border,
        card: theme.colors.surface,
        notification: theme.colors.danger,
        primary: theme.colors.accent,
        text: theme.colors.text,
      },
    };
  }, [theme]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <View
          style={[styles.app, { backgroundColor: theme.colors.background }]}
        >
          <AppHeader />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: theme.colors.background },
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
