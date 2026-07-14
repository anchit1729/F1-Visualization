import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { motion, radius, spacing, typography } from '../../theme/tokens';
import FocusRing from './FocusRing';
import { shouldScaleControl, useControlFeedback } from './useControlFeedback';

type ButtonProps = Pick<
  PressableProps,
  'disabled' | 'onPress' | 'style' | 'testID'
> & {
  label: string;
};

export default function Button({
  disabled,
  label,
  onPress,
  style,
  testID,
}: ButtonProps) {
  const theme = useAppTheme();
  const { handleBlur, handleFocus, isFocused, isReduceMotionEnabled } =
    useControlFeedback();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onPress={onPress}
      style={(state) => [
        styles.button,
        { backgroundColor: theme.colors.accent },
        shouldScaleControl(state.pressed, isReduceMotionEnabled) &&
          styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      testID={testID}
    >
      <Text style={[styles.label, { color: theme.colors.onAccent }]}>
        {label}
      </Text>
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
  },
  pressed: {
    transform: [{ scale: motion.pressedScale }],
  },
});
