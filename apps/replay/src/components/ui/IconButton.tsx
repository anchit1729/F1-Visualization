import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { useLiquidGlass } from '../../theme/useLiquidGlass';
import { motion, radius } from '../../theme/tokens';
import ChromeSurface from './ChromeSurface';
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
        styles.button,
        !useGlass && {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        useGlass && styles.glassButton,
        shouldScaleControl(state.pressed, isReduceMotionEnabled) &&
          styles.pressed,
        disabled && !useGlass && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      testID={testID}
    >
      {useGlass ? (
        <ChromeSurface
          interactive={!disabled}
          style={styles.glassSurface}
          variant="control"
        >
          <View
            style={[
              styles.glassContent,
              disabled && styles.disabledGlassContent,
            ]}
          >
            {children}
          </View>
        </ChromeSurface>
      ) : (
        children
      )}
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
  disabledGlassContent: {
    opacity: 0.45,
  },
  glassContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassSurface: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  glassButton: {
    borderWidth: 0,
  },
  pressed: {
    transform: [{ scale: motion.pressedScale }],
  },
});
