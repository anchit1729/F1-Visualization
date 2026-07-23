import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { useLiquidGlass } from '../../theme/useLiquidGlass';
import { motion } from '../../theme/tokens';
import ChromeSurface from './ChromeSurface';
import FocusRing from './FocusRing';
import { shouldScaleControl, useControlFeedback } from './useControlFeedback';

type ChromeIconButtonProps = PropsWithChildren<
  Pick<PressableProps, 'disabled' | 'onPress' | 'style' | 'testID'> & {
    accessibilityLabel: string;
  }
>;

export default function ChromeIconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  style,
  testID,
}: ChromeIconButtonProps) {
  const useGlass = useLiquidGlass();
  const { handleBlur, handleFocus, isFocused, isReduceMotionEnabled } =
    useControlFeedback();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onPress={onPress}
      style={(state) => [
        styles.pressable,
        shouldScaleControl(state.pressed, isReduceMotionEnabled) &&
          styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      testID={testID}
    >
      <ChromeSurface interactive style={styles.surface} variant="control">
        {useGlass ? (
          <View style={disabled && styles.disabledContent}>{children}</View>
        ) : (
          children
        )}
      </ChromeSurface>
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabledContent: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: motion.pressedScale }],
  },
  pressable: {
    position: 'relative',
  },
  surface: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
});
