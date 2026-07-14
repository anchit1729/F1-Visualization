import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

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
      <ChromeSurface style={styles.surface} variant="control">
        {children}
      </ChromeSurface>
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
