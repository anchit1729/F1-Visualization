import { Platform, type ColorSchemeName } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 999,
} as const;

export const typography = {
  body: 16,
  bodyLineHeight: 24,
  label: 15,
  title: 32,
  titleLineHeight: 38,
  carNumberFamily: Platform.select({
    android: 'sans-serif-condensed',
    default: 'sans-serif',
    ios: 'Avenir Next Condensed',
    web: 'Arial Narrow, Roboto Condensed, sans-serif',
  }),
  weight: {
    medium: '500',
    regular: '400',
  },
} as const;

export const motion = {
  quick: 140,
  standard: 220,
  pressedScale: 0.98,
} as const;

export const focus = {
  offset: 2,
  width: 3,
} as const;

const lightColors = {
  accent: '#d10a04',
  background: '#eef0f2',
  border: '#c4c8cd',
  danger: '#b42318',
  focusRing: '#005fcc',
  onAccent: '#ffffff',
  overlay: '#00000080',
  surface: '#fafafa',
  text: '#121419',
  textSecondary: '#50565f',
} as const;

const darkColors = {
  accent: '#ff3b30',
  background: '#08090b',
  border: '#34383e',
  danger: '#ff7b72',
  focusRing: '#64b5ff',
  onAccent: '#250100',
  overlay: '#00000080',
  surface: '#15171b',
  text: '#f5f6f7',
  textSecondary: '#b5bac2',
} as const;

function createSurfaceTokens(isDark: boolean) {
  return {
    chrome: {
      backgroundColor: isDark ? '#101216' : '#e9ebed',
      borderColor: isDark ? '#34383e' : '#c4c8cd',
      radius: radius.md,
    },
    control: {
      backgroundColor: isDark ? '#202329' : '#fafafa',
      borderColor: isDark ? '#41464e' : '#b9bec5',
      radius: radius.sm,
    },
    panel: {
      backgroundColor: isDark ? '#15171b' : '#fafafa',
      borderColor: isDark ? '#34383e' : '#c4c8cd',
      radius: radius.lg,
    },
  } as const;
}

const lightTheme = {
  colors: lightColors,
  mode: 'light',
  surfaces: createSurfaceTokens(false),
} as const;

const darkTheme = {
  colors: darkColors,
  mode: 'dark',
  surfaces: createSurfaceTokens(true),
} as const;

export type AppTheme = typeof lightTheme | typeof darkTheme;
export type SurfaceVariant = keyof AppTheme['surfaces'];

export function getTheme(
  colorScheme: ColorSchemeName | null | undefined,
): AppTheme {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}
