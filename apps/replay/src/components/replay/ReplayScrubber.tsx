/* eslint-disable react/jsx-props-no-spreading -- PanResponder exposes gesture handlers as a prop bundle. */
import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { radius } from '../../theme/tokens';
import FocusRing from '../ui/FocusRing';
import type { ReplayScrubberProps } from './ReplayScrubber.types';

const keyboardStepMs = 1000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function valueFromDrag(
  initialMs: number,
  distanceX: number,
  width: number,
  minimumMs: number,
  maximumMs: number,
) {
  if (width <= 0) return initialMs;
  return clamp(
    initialMs + (distanceX / width) * (maximumMs - minimumMs),
    minimumMs,
    maximumMs,
  );
}

export default function ReplayScrubber({
  disabled = false,
  maximumMs,
  minimumMs,
  onCommit,
  onPreview,
  valueMs,
  valueText,
}: ReplayScrubberProps) {
  const theme = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [width, setWidth] = useState(1);
  const dragStart = useRef(valueMs);
  const preview = useCallback(
    (distanceX: number) => {
      const nextValue = valueFromDrag(
        dragStart.current,
        distanceX,
        width,
        minimumMs,
        maximumMs,
      );
      onPreview(nextValue);
      return nextValue;
    },
    [maximumMs, minimumMs, onPreview, width],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          dragStart.current = valueMs;
        },
        onPanResponderMove: (_, gesture) => preview(gesture.dx),
        onPanResponderRelease: (_, gesture) => onCommit(preview(gesture.dx)),
        onPanResponderTerminate: () => onPreview(valueMs),
        onStartShouldSetPanResponder: () => !disabled,
      }),
    [disabled, onCommit, onPreview, preview, valueMs],
  );
  const progress = (valueMs - minimumMs) / (maximumMs - minimumMs);
  const adjust = (direction: -1 | 1) =>
    onCommit(clamp(valueMs + direction * keyboardStepMs, minimumMs, maximumMs));

  return (
    <Pressable
      {...panResponder.panHandlers}
      accessibilityActions={[
        { label: 'Backward one second', name: 'decrement' },
        { label: 'Forward one second', name: 'increment' },
      ]}
      accessibilityLabel="Replay position"
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{
        max: maximumMs,
        min: minimumMs,
        now: valueMs,
        text: valueText,
      }}
      disabled={disabled}
      onAccessibilityAction={({ nativeEvent }) =>
        adjust(nativeEvent.actionName === 'decrement' ? -1 : 1)
      }
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onPress={({ nativeEvent }) =>
        onCommit(
          valueFromDrag(
            minimumMs,
            nativeEvent.locationX,
            width,
            minimumMs,
            maximumMs,
          ),
        )
      }
      style={[styles.control, { opacity: disabled ? 0.5 : 1 }]}
      testID="replay-scrubber"
    >
      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: theme.colors.accent,
              width: `${progress * 100}%`,
            },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: theme.colors.text,
              left: `${progress * 100}%`,
            },
          ]}
        />
      </View>
      <FocusRing visible={focused} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  fill: {
    borderRadius: radius.pill,
    height: 6,
  },
  thumb: {
    borderRadius: 10,
    height: 20,
    marginLeft: -10,
    marginTop: -13,
    position: 'absolute',
    top: '50%',
    width: 20,
  },
  track: {
    borderRadius: radius.pill,
    height: 6,
  },
});
