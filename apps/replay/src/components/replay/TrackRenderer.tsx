import type { Driver, Point, TrackGeometry } from '@f1/domain';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, G, Polyline, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../theme/useAppTheme';
import { useLiquidGlass } from '../../theme/useLiquidGlass';
import { radius, spacing, typography } from '../../theme/tokens';
import FocusRing from '../ui/FocusRing';

const hitTargetSize = 44;

type TrackRendererProps = {
  drivers?: Driver[];
  onSelectDriver?: (driverId: string) => void;
  positions?: Record<string, Point>;
  selectedDriverId?: string | null;
  testID?: string;
  track: TrackGeometry;
};

type CarHitTargetProps = {
  driver: Driver;
  left: `${number}%`;
  onPress: (event: GestureResponderEvent) => void;
  selected: boolean;
  top: `${number}%`;
};

function CarHitTarget({
  driver,
  left,
  onPress,
  selected,
  top,
}: CarHitTargetProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={`${driver.name}, car ${driver.driverNumber}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      nativeID={`car-select-hit-${driver.id}`}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={[styles.hitTarget, { left, top }]}
      testID={`car-hit-${driver.id}`}
    >
      <FocusRing visible={focused} />
    </Pressable>
  );
}

type DriverListButtonProps = {
  available: boolean;
  driver: Driver;
  onPress?: () => void;
  selected: boolean;
};

function DriverListButton({
  available,
  driver,
  onPress,
  selected,
}: DriverListButtonProps) {
  const theme = useAppTheme();
  const useGlass = useLiquidGlass();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={`${driver.name}, car ${driver.driverNumber}${available ? '' : ', position unavailable'}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !available, selected }}
      disabled={!available}
      nativeID={`car-select-${driver.id}`}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={[
        styles.driverButton,
        {
          backgroundColor: theme.colors.surface,
          borderColor: selected ? theme.colors.focusRing : theme.colors.border,
          borderRadius: useGlass ? theme.liquidGlass.control.radius : radius.sm,
          opacity: available ? 1 : 0.5,
        },
      ]}
      testID={`driver-list-${driver.id}`}
    >
      <View style={[styles.teamDot, { backgroundColor: driver.teamColor }]} />
      <Text style={[styles.driverCode, { color: theme.colors.text }]}>
        {driver.code} {driver.driverNumber}
      </Text>
      <FocusRing visible={focused} />
    </Pressable>
  );
}

export function resolveNearestDriverId(
  drivers: readonly Driver[],
  positions: Readonly<Record<string, Point>>,
  point: Point,
  maximumDistance = Number.POSITIVE_INFINITY,
) {
  return drivers.reduce<{ distance: number; id: string } | null>(
    (nearest, driver) => {
      const position = positions[driver.id];
      if (!position) return nearest;
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (
        distance > maximumDistance ||
        (nearest && nearest.distance <= distance)
      ) {
        return nearest;
      }
      return { distance, id: driver.id };
    },
    null,
  )?.id;
}

export function getContrastingTextColor(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return red * 299 + green * 587 + blue * 114 >= 128000 ? '#000000' : '#ffffff';
}

export function getTrackLayout(
  track: TrackGeometry,
  viewport: { height: number; width: number },
) {
  const [x, y, width, height] = track.viewBox;
  return {
    aspectRatio: width / height,
    unitsPerPixel:
      1 / Math.min(viewport.width / width, viewport.height / height),
    viewBox: `${x} ${y} ${width} ${height}`,
  };
}

export default function TrackRenderer({
  drivers = [],
  onSelectDriver,
  positions = {},
  selectedDriverId,
  testID,
  track,
}: TrackRendererProps) {
  const theme = useAppTheme();
  const useGlass = useLiquidGlass();
  const [x, y, width, height] = track.viewBox;
  const [viewport, setViewport] = useState({
    height: (320 * height) / width,
    width: 320,
  });
  const { aspectRatio, unitsPerPixel, viewBox } = getTrackLayout(
    track,
    viewport,
  );
  const points = track.centerline
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  const positionedDrivers = drivers.filter(({ id }) => positions[id]);

  const updateViewport = ({ nativeEvent }: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = nativeEvent.layout;
    if (nextHeight > 0 && nextWidth > 0) {
      setViewport((current) =>
        current.height === nextHeight && current.width === nextWidth
          ? current
          : { height: nextHeight, width: nextWidth },
      );
    }
  };

  const selectFromHitTarget = (
    driver: Driver,
    event: GestureResponderEvent,
  ) => {
    if (!onSelectDriver) return;
    const position = positions[driver.id];
    const { locationX = hitTargetSize / 2, locationY = hitTargetSize / 2 } =
      event.nativeEvent;
    const point = {
      x: position.x + (locationX - hitTargetSize / 2) * unitsPerPixel,
      y: position.y + (locationY - hitTargetSize / 2) * unitsPerPixel,
    };
    const nearestId = resolveNearestDriverId(
      drivers,
      positions,
      point,
      (hitTargetSize / 2) * unitsPerPixel,
    );
    if (nearestId) onSelectDriver(nearestId);
  };

  return (
    <View style={styles.container} testID={testID}>
      <View
        onLayout={updateViewport}
        style={[
          styles.frame,
          {
            aspectRatio,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: useGlass ? theme.liquidGlass.panel.radius : radius.md,
          },
        ]}
        testID={testID ? `${testID}-map` : undefined}
      >
        <Svg
          accessibilityLabel="Formula 1 circuit map"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          testID="track-svg"
          viewBox={viewBox}
          width="100%"
        >
          <Polyline
            fill="none"
            points={points}
            stroke={theme.colors.border}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={14 * unitsPerPixel}
            testID="track-centerline-outline"
          />
          <Polyline
            fill="none"
            points={points}
            stroke={theme.colors.textSecondary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={4 * unitsPerPixel}
            testID="track-centerline"
          />
          {track.sectorBoundaries.map((point, sectorIndex) => (
            <Circle
              cx={point.x}
              cy={point.y}
              fill={theme.colors.accent}
              key={`${point.x}-${point.y}`}
              r={5 * unitsPerPixel}
              stroke={theme.colors.surface}
              strokeWidth={2 * unitsPerPixel}
              testID={`sector-marker-${sectorIndex + 1}`}
            />
          ))}
          <Circle
            cx={track.startFinish.x}
            cy={track.startFinish.y}
            fill={theme.colors.surface}
            r={7 * unitsPerPixel}
            stroke={theme.colors.text}
            strokeWidth={3 * unitsPerPixel}
            testID="start-finish-marker"
          />
          {positionedDrivers.map((driver) => {
            const position = positions[driver.id];
            const selected = selectedDriverId === driver.id;
            return (
              <G key={driver.id} pointerEvents="none">
                <Circle
                  cx={position.x}
                  cy={position.y}
                  fill={driver.teamColor}
                  r={(selected ? 12 : 10) * unitsPerPixel}
                  stroke={selected ? theme.colors.focusRing : theme.colors.text}
                  strokeWidth={(selected ? 4 : 2) * unitsPerPixel}
                  testID={`car-dot-${driver.id}`}
                />
                <SvgText
                  fill={getContrastingTextColor(driver.teamColor)}
                  fontFamily={typography.carNumberFamily}
                  fontSize={11.5 * unitsPerPixel}
                  fontWeight="500"
                  letterSpacing={0.15 * unitsPerPixel}
                  textAnchor="middle"
                  testID={`car-number-${driver.id}`}
                  x={position.x}
                  y={position.y + 4 * unitsPerPixel}
                >
                  {driver.driverNumber}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        {onSelectDriver
          ? positionedDrivers.map((driver) => {
              const position = positions[driver.id];
              return (
                <CarHitTarget
                  driver={driver}
                  key={`${driver.id}-hit`}
                  left={`${((position.x - x) / width) * 100}%`}
                  onPress={(event) => selectFromHitTarget(driver, event)}
                  selected={selectedDriverId === driver.id}
                  top={`${((position.y - y) / height) * 100}%`}
                />
              );
            })
          : null}
      </View>
      {onSelectDriver && drivers.length > 0 ? (
        <ScrollView
          accessibilityLabel="Drivers"
          contentContainerStyle={styles.driverList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {drivers.map((driver) => {
            const available = Boolean(positions[driver.id]);
            return (
              <DriverListButton
                available={available}
                driver={driver}
                key={`${driver.id}-list`}
                onPress={
                  available ? () => onSelectDriver(driver.id) : undefined
                }
                selected={selectedDriverId === driver.id}
              />
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    width: '100%',
  },
  driverButton: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: hitTargetSize,
    minWidth: hitTargetSize,
    paddingHorizontal: spacing.sm,
    position: 'relative',
  },
  driverCode: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
  },
  driverList: {
    gap: spacing.sm,
    padding: spacing.xs,
  },
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  hitTarget: {
    borderRadius: hitTargetSize / 2,
    height: hitTargetSize,
    marginLeft: -hitTargetSize / 2,
    marginTop: -hitTargetSize / 2,
    position: 'absolute',
    width: hitTargetSize,
  },
  teamDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
});
