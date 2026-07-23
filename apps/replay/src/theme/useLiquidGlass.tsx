import { createContext, useContext, type PropsWithChildren } from 'react';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { Platform } from 'react-native';

import { useAccessibilityPreferences } from './useAccessibilityPreferences';

const LiquidGlassContext = createContext(false);

export function shouldUseLiquidGlass(
  platform: string,
  isAPIAvailable: boolean,
  isCompiledWithLiquidGlass: boolean,
  isReduceTransparencyEnabled: boolean,
) {
  return (
    platform === 'ios' &&
    isAPIAvailable &&
    isCompiledWithLiquidGlass &&
    !isReduceTransparencyEnabled
  );
}

function getNativeLiquidGlassCapabilities() {
  if (Platform.OS !== 'ios') {
    return { isAPIAvailable: false, isCompiledWithLiquidGlass: false };
  }

  try {
    return {
      isAPIAvailable: isGlassEffectAPIAvailable(),
      isCompiledWithLiquidGlass: isLiquidGlassAvailable(),
    };
  } catch {
    // A stale development client may not contain the native module yet.
    return { isAPIAvailable: false, isCompiledWithLiquidGlass: false };
  }
}

type LiquidGlassProviderProps = PropsWithChildren<{
  enabled?: boolean;
}>;

export function LiquidGlassProvider({
  children,
  enabled,
}: LiquidGlassProviderProps) {
  const { isReduceTransparencyEnabled } = useAccessibilityPreferences();
  const { isAPIAvailable, isCompiledWithLiquidGlass } =
    getNativeLiquidGlassCapabilities();
  const isEnabled =
    enabled ??
    shouldUseLiquidGlass(
      Platform.OS,
      isAPIAvailable,
      isCompiledWithLiquidGlass,
      isReduceTransparencyEnabled,
    );

  return (
    <LiquidGlassContext.Provider value={isEnabled}>
      {children}
    </LiquidGlassContext.Provider>
  );
}

export function useLiquidGlass() {
  return useContext(LiquidGlassContext);
}
