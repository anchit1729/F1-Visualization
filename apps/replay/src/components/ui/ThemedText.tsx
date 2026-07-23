import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';

type TextTone = 'danger' | 'on-accent' | 'primary' | 'secondary';

type ThemedTextProps = Pick<
  TextProps,
  | 'accessibilityLabel'
  | 'accessibilityLiveRegion'
  | 'accessibilityRole'
  | 'children'
  | 'numberOfLines'
  | 'style'
  | 'testID'
> & { color?: string; tone?: TextTone };

export default function ThemedText({
  accessibilityLabel,
  accessibilityLiveRegion,
  accessibilityRole,
  children,
  color: colorOverride,
  numberOfLines,
  style,
  testID,
  tone = 'primary',
}: ThemedTextProps) {
  const theme = useAppTheme();
  const color =
    colorOverride ??
    {
      danger: theme.colors.danger,
      'on-accent': theme.colors.onAccent,
      primary: theme.colors.text,
      secondary: theme.colors.textSecondary,
    }[tone];

  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={accessibilityLiveRegion}
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      style={[style, { color }]}
      testID={testID}
    >
      {children}
    </Text>
  );
}
