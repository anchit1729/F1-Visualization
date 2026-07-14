import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text, View } from 'react-native';

import Button from '../src/components/ui/Button';
import ChromeButton from '../src/components/ui/ChromeButton';
import ChromeSurface from '../src/components/ui/ChromeSurface';
import ErrorState from '../src/components/ui/ErrorState';
import IconButton from '../src/components/ui/IconButton';
import LoadingState from '../src/components/ui/LoadingState';
import Screen from '../src/components/ui/Screen';
import ThemedText from '../src/components/ui/ThemedText';
import { shouldScaleControl } from '../src/components/ui/useControlFeedback';
import { AppThemeProvider } from '../src/theme/useAppTheme';
import { focus, getTheme, motion } from '../src/theme/tokens';

afterEach(() => {
  jest.restoreAllMocks();
});

function channelToLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  );
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('motorsport surface policy', () => {
  test('uses light while the system scheme is initially indeterminate', () => {
    expect(getTheme(null).mode).toBe('light');
    expect(getTheme(undefined).mode).toBe('light');
    expect(getTheme('dark').mode).toBe('dark');
  });

  test('keeps all semantic material variants stable in light and dark', async () => {
    const result = await render(
      <View>
        {(['light', 'dark'] as const).map((appearance) =>
          (['chrome', 'panel', 'control'] as const).map((variant) => (
            <ChromeSurface
              appearance={appearance}
              key={`${appearance}-${variant}`}
              variant={variant}
            >
              <Text>{`${appearance} ${variant}`}</Text>
            </ChromeSurface>
          )),
        )}
      </View>,
    );

    expect(result.toJSON()).toMatchSnapshot();
  });

  test.each([
    { label: 'mobile', width: 390 },
    { label: 'desktop', width: 1024 },
  ])('keeps the $label material frame stable', async ({ label, width }) => {
    const result = await render(
      <View style={{ width }}>
        <ChromeSurface appearance="dark" variant="chrome">
          <Text>{label} chrome</Text>
        </ChromeSurface>
        <ChromeSurface appearance="light" variant="panel">
          <Text>{label} panel</Text>
        </ChromeSurface>
      </View>,
    );

    expect(result.toJSON()).toMatchSnapshot(label);
  });

  test.each(['light', 'dark'] as const)(
    'uses the flat %s panel recipe without transparency',
    async (appearance) => {
      const theme = getTheme(appearance);
      await render(
        <ChromeSurface appearance={appearance} testID="surface">
          <Text>Panel content</Text>
        </ChromeSurface>,
      );

      expect(screen.getByTestId('surface')).toHaveStyle({
        backgroundColor: theme.surfaces.panel.backgroundColor,
        borderColor: theme.surfaces.panel.borderColor,
      });
    },
  );
});

describe('accessible controls and states', () => {
  test('activates an enabled button and exposes its role', async () => {
    const handlePress = jest.fn();
    await render(<Button label="Start replay" onPress={handlePress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Start replay' }));

    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  test('shows keyboard focus and activates the focused control', async () => {
    const handlePress = jest.fn();
    await render(<Button label="Start replay" onPress={handlePress} />);
    const button = screen.getByRole('button', { name: 'Start replay' });

    await fireEvent(button, 'focus');
    expect(screen.getByTestId('focus-ring')).toHaveStyle({
      borderColor: getTheme('light').colors.focusRing,
      borderWidth: focus.width,
    });

    await fireEvent.press(button);
    expect(handlePress).toHaveBeenCalledTimes(1);

    await fireEvent(button, 'blur');
    expect(screen.queryByTestId('focus-ring')).toBeNull();
  });

  test('shows restrained scale feedback only when motion is allowed', () => {
    expect(shouldScaleControl(true, false)).toBe(true);
    expect(shouldScaleControl(true, true)).toBe(false);
    expect(shouldScaleControl(false, false)).toBe(false);
  });

  test('removes scale feedback when Reduce Motion is enabled', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    await render(<Button label="Start replay" testID="motion-button" />);

    await act(async () => Promise.resolve());
    await fireEvent(screen.getByTestId('motion-button'), 'pressIn');

    expect(screen.getByTestId('motion-button')).not.toHaveStyle({
      transform: [{ scale: motion.pressedScale }],
    });
  });

  test('does not activate a disabled button', async () => {
    const handlePress = jest.fn();
    await render(
      <Button disabled label="Start replay" onPress={handlePress} />,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Start replay', disabled: true }),
    );

    expect(handlePress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start replay' })).toHaveStyle({
      opacity: 0.45,
    });
  });

  test('requires an explicit accessible name for icon-only controls', async () => {
    await render(
      <IconButton accessibilityLabel="Pause replay">
        <Text>Ⅱ</Text>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'Pause replay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause replay' })).toHaveStyle({
      height: 44,
      width: 44,
    });
  });

  test('gives chrome controls the same accessible button contract', async () => {
    await render(<ChromeButton label="Open controls" />);

    const button = screen.getByRole('button', { name: 'Open controls' });
    expect(button).toBeTruthy();

    await fireEvent(button, 'focus');
    expect(screen.getByTestId('focus-ring')).toHaveStyle({
      borderWidth: focus.width,
    });
  });

  test('keeps disabled chrome controls accessible without fading the material', async () => {
    await render(<ChromeButton disabled label="Open controls" />);

    const button = screen.getByRole('button', {
      disabled: true,
      name: 'Open controls',
    });
    expect(button).toBeTruthy();
    expect(button).not.toHaveStyle({ opacity: 0.45 });
  });

  test('exposes loading and error semantics', async () => {
    const { rerender } = await render(<LoadingState label="Loading race" />);
    expect(
      screen.getByRole('progressbar', { name: 'Loading race' }),
    ).toBeTruthy();

    await rerender(<ErrorState message="Replay unavailable" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('theme contrast', () => {
  test.each(['light', 'dark'] as const)(
    'keeps the %s screen and text on the same resolved theme',
    async (mode) => {
      const theme = getTheme(mode);

      await render(
        <AppThemeProvider appearance={mode}>
          <Screen testID="themed-screen">
            <ThemedText testID="primary-text">Primary</ThemedText>
            <ThemedText testID="secondary-text" tone="secondary">
              Secondary
            </ThemedText>
          </Screen>
        </AppThemeProvider>,
      );

      expect(screen.getByTestId('themed-screen')).toHaveStyle({
        backgroundColor: theme.colors.background,
      });
      expect(screen.getByTestId('primary-text')).toHaveStyle({
        color: theme.colors.text,
      });
      expect(screen.getByTestId('secondary-text')).toHaveStyle({
        color: theme.colors.textSecondary,
      });
    },
  );

  test.each(['light', 'dark'] as const)(
    '%s theme meets text contrast targets',
    (mode) => {
      const theme = getTheme(mode);

      expect(
        contrastRatio(theme.colors.text, theme.colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.textSecondary, theme.colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.onAccent, theme.colors.accent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.focusRing, theme.colors.background),
      ).toBeGreaterThanOrEqual(3);
    },
  );
});
