import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { focus, radius } from '../../theme/tokens';

type FocusRingProps = {
  visible: boolean;
};

export default function FocusRing({ visible }: FocusRingProps) {
  const theme = useAppTheme();
  if (!visible) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.ring, { borderColor: theme.colors.focusRing }]}
      testID="focus-ring"
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    bottom: 0,
    borderRadius: radius.sm,
    borderWidth: focus.width,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
});
