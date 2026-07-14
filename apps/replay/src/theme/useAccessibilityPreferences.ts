import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export type AccessibilityPreferences = {
  isHighContrastEnabled: boolean;
  isReduceMotionEnabled: boolean;
  isReduceTransparencyEnabled: boolean;
};

const initialPreferences: AccessibilityPreferences = {
  isHighContrastEnabled: false,
  isReduceMotionEnabled: false,
  isReduceTransparencyEnabled: false,
};

export function useAccessibilityPreferences(): AccessibilityPreferences {
  const [preferences, setPreferences] = useState(initialPreferences);

  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      const [
        isHighTextContrastEnabled,
        isDarkerSystemColorsEnabled,
        isReduceMotionEnabled,
        isReduceTransparencyEnabled,
      ] = await Promise.all([
        AccessibilityInfo.isHighTextContrastEnabled(),
        AccessibilityInfo.isDarkerSystemColorsEnabled(),
        AccessibilityInfo.isReduceMotionEnabled(),
        AccessibilityInfo.isReduceTransparencyEnabled(),
      ]);

      if (isMounted) {
        setPreferences({
          isHighContrastEnabled:
            isHighTextContrastEnabled || isDarkerSystemColorsEnabled,
          isReduceMotionEnabled,
          isReduceTransparencyEnabled,
        });
      }
    };

    loadPreferences().catch(() => undefined);

    const subscriptions = [
      AccessibilityInfo.addEventListener('highTextContrastChanged', (value) => {
        setPreferences((current) => ({
          ...current,
          isHighContrastEnabled: value,
        }));
      }),
      AccessibilityInfo.addEventListener(
        'darkerSystemColorsChanged',
        (value) => {
          setPreferences((current) => ({
            ...current,
            isHighContrastEnabled: value,
          }));
        },
      ),
      AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
        setPreferences((current) => ({
          ...current,
          isReduceMotionEnabled: value,
        }));
      }),
      AccessibilityInfo.addEventListener(
        'reduceTransparencyChanged',
        (value) => {
          setPreferences((current) => ({
            ...current,
            isReduceTransparencyEnabled: value,
          }));
        },
      ),
    ];

    return () => {
      isMounted = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return preferences;
}
