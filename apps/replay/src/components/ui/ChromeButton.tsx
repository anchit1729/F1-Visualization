import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { motion, spacing, typography } from '../../theme/tokens';
import ChromeSurface from './ChromeSurface';
import FocusRing from './FocusRing';
import { shouldScaleControl, useControlFeedback } from './useControlFeedback';

type ChromeButtonProps = Pick<
  PressableProps,
  | 'accessibilityLabel'
  | 'disabled'
  | 'nativeID'
  | 'onPress'
  | 'style'
  | 'testID'
> & { label: string };

export default function ChromeButton({
  accessibilityLabel,
  disabled,
  label,
  nativeID,
  onPress,
  style,
  testID,
}: ChromeButtonProps) {
  const theme = useAppTheme();
  const { handleBlur, handleFocus, isFocused, isReduceMotionEnabled } =
    useControlFeedback();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      nativeID={nativeID}
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
        <Text
          style={[
            styles.label,
            {
              color: disabled ? theme.colors.textSecondary : theme.colors.text,
            },
          ]}
        >
          {label}
        </Text>
      </ChromeSurface>
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.2,
  },
  pressed: {
    transform: [{ scale: motion.pressedScale }],
  },
  pressable: {
    position: 'relative',
  },
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
