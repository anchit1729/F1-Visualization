import { useState } from 'react';

import { useAccessibilityPreferences } from '../../theme/useAccessibilityPreferences';

export function useControlFeedback() {
  const [isFocused, setIsFocused] = useState(false);
  const { isReduceMotionEnabled } = useAccessibilityPreferences();

  return {
    handleBlur: () => setIsFocused(false),
    handleFocus: () => setIsFocused(true),
    isFocused,
    isReduceMotionEnabled,
  };
}

export function shouldScaleControl(
  isPressed: boolean,
  isReduceMotionEnabled: boolean,
) {
  return isPressed && !isReduceMotionEnabled;
}
