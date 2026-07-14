import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { motion, radius } from '../../theme/tokens';
import FocusRing from './FocusRing';
import { shouldScaleControl, useControlFeedback } from './useControlFeedback';

type IconButtonProps = PropsWithChildren<
  Pick<PressableProps, 'disabled' | 'onPress' | 'style' | 'testID'> & {
    accessibilityLabel: string;
  }
>;

export default function IconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  style,
  testID,
}: IconButtonProps) {
  const theme = useAppTheme();
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
        styles.button,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        shouldScaleControl(state.pressed, isReduceMotionEnabled) &&
          styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      testID={testID}
    >
      {children}
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: motion.pressedScale }],
  },
});
