import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

import { getTheme, type AppTheme } from './tokens';

const AppThemeContext = createContext<AppTheme>(getTheme('light'));
const darkModeQuery = '(prefers-color-scheme: dark)';

function subscribeToWebAppearance(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(darkModeQuery);
  mediaQuery.addEventListener('change', onChange);

  return () => mediaQuery.removeEventListener('change', onChange);
}

function getWebAppearance() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.(darkModeQuery).matches
    ? ('dark' as const)
    : ('light' as const);
}

function useSystemAppearance() {
  const nativeAppearance = useColorScheme();
  const webAppearance = useSyncExternalStore<'dark' | 'light'>(
    subscribeToWebAppearance,
    getWebAppearance,
    () => 'light' as const,
  );

  return Platform.OS === 'web' ? webAppearance : nativeAppearance;
}

type AppThemeProviderProps = PropsWithChildren<{
  appearance?: 'dark' | 'light';
}>;

export function AppThemeProvider({
  appearance,
  children,
}: AppThemeProviderProps) {
  const systemAppearance = useSystemAppearance();
  const theme = getTheme(appearance ?? systemAppearance);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    document.documentElement.style.backgroundColor = theme.colors.background;
    document.documentElement.style.colorScheme = theme.mode;
    document.body.style.backgroundColor = theme.colors.background;
  }, [theme]);

  return (
    <AppThemeContext.Provider value={theme}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
