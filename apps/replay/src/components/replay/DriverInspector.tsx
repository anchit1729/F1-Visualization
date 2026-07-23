import type { Driver, FastestLap } from '@f1/domain';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import type {
  DriverTimingFrame,
  SampleValue,
  TelemetryFrame,
} from '../../features/replay/frameSelectors';
import { useAppTheme } from '../../theme/useAppTheme';
import { radius, spacing, typography } from '../../theme/tokens';
import ChromeSurface from '../ui/ChromeSurface';
import IconButton from '../ui/IconButton';
import ThemedText from '../ui/ThemedText';

export type InspectorPresentation = 'bottom' | 'side';

export function inspectorPresentationForWidth(
  width: number,
): InspectorPresentation {
  return width >= 800 ? 'side' : 'bottom';
}

export function formatLapTime(milliseconds: number | null | undefined) {
  if (milliseconds === null || milliseconds === undefined) {
    return 'Unavailable';
  }
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatSample<T>(sample: SampleValue<T>, format: (value: T) => string) {
  return sample.status === 'available' ? format(sample.value) : 'Unavailable';
}

function formatBestLap(
  timing: DriverTimingFrame,
  overallFastestLap: FastestLap | null,
) {
  const duration = timing.bestLap?.durationMs;
  if (duration === null || duration === undefined) return 'Unavailable';
  if (!overallFastestLap) return formatLapTime(duration);
  const deltaMs = duration - overallFastestLap.durationMs;
  return `${formatLapTime(duration)} · ${deltaMs === 0 ? 'Overall fastest' : `+${(deltaMs / 1000).toFixed(3)}`}`;
}

function formatGQuality(quality: 'estimated' | 'low' | 'unavailable') {
  if (quality === 'unavailable') return 'Unavailable';
  return quality === 'low' ? 'Low confidence' : 'Estimated';
}

type Palette = {
  info: string;
  mutedSurface: string;
  positive: string;
  purple: string;
  warning: string;
};

function useTelemetryPalette(): Palette {
  const theme = useAppTheme();
  return {
    info: theme.mode === 'dark' ? '#64d2ff' : '#0071a4',
    mutedSurface: theme.mode === 'dark' ? '#ffffff12' : '#0000000d',
    positive: theme.mode === 'dark' ? '#32d74b' : '#248a3d',
    purple: theme.mode === 'dark' ? '#bf5af2' : '#8944ab',
    warning: theme.mode === 'dark' ? '#ff9f0a' : '#b25000',
  };
}

type ValueCellProps = {
  color?: string;
  label: string;
  testID?: string;
  value: string;
};

function ValueCell({ color, label, testID, value }: ValueCellProps) {
  return (
    <View style={styles.valueCell} testID={testID}>
      <ThemedText style={styles.metricLabel} tone="secondary">
        {label}
      </ThemedText>
      <ThemedText color={color} numberOfLines={1} style={styles.metricValue}>
        {value}
      </ThemedText>
    </View>
  );
}

type SignalMeterProps = {
  color: string;
  label: string;
  progress: number | null;
  testID?: string;
  value: string;
};

function SignalMeter({
  color,
  label,
  progress,
  testID,
  value,
}: SignalMeterProps) {
  const theme = useAppTheme();
  const palette = useTelemetryPalette();
  const width = `${Math.max(0, Math.min(1, progress ?? 0)) * 100}%`;

  return (
    <View style={styles.signal}>
      <View style={styles.signalCopy}>
        <ThemedText style={styles.signalLabel} tone="secondary">
          {label}
        </ThemedText>
        <ThemedText color={color} style={styles.signalValue}>
          {value}
        </ThemedText>
      </View>
      <View
        style={[
          styles.signalTrack,
          {
            backgroundColor: palette.mutedSurface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {progress === null ? null : (
          <View
            style={[
              styles.signalFill,
              { backgroundColor: color, width: width as DimensionValue },
            ]}
            testID={testID}
          />
        )}
      </View>
    </View>
  );
}

type SignedMeterProps = {
  label: string;
  negativeColor: string;
  positiveColor: string;
  sample: SampleValue<number>;
};

function SignedMeter({
  label,
  negativeColor,
  positiveColor,
  sample,
}: SignedMeterProps) {
  const theme = useAppTheme();
  const palette = useTelemetryPalette();
  const value = sample.status === 'available' ? sample.value : null;
  const magnitude = Math.min(Math.abs(value ?? 0) / 4, 1);
  const width = `${magnitude * 50}%` as DimensionValue;
  const color = (value ?? 0) < 0 ? negativeColor : positiveColor;

  return (
    <View style={styles.signedMeter}>
      <View style={styles.signedCopy}>
        <ThemedText style={styles.signalLabel} tone="secondary">
          {label}
        </ThemedText>
        <ThemedText
          color={value === null ? undefined : color}
          style={styles.signedValue}
        >
          {value === null ? 'Unavailable' : `${value.toFixed(2)} g`}
        </ThemedText>
      </View>
      <View
        style={[
          styles.signedTrack,
          {
            backgroundColor: palette.mutedSurface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[styles.zeroLine, { backgroundColor: theme.colors.border }]}
        />
        {value === null ? null : (
          <View
            style={[
              styles.signedFill,
              value < 0 ? { right: '50%' } : { left: '50%' },
              { backgroundColor: color, width },
            ]}
          />
        )}
      </View>
    </View>
  );
}

type DriverInspectorProps = {
  driver: Driver;
  drivers: Driver[];
  onClose: () => void;
  overallFastestLap: FastestLap | null;
  presentation: InspectorPresentation;
  telemetry: TelemetryFrame;
  timing: DriverTimingFrame;
};

export default function DriverInspector({
  driver,
  drivers,
  onClose,
  overallFastestLap,
  presentation,
  telemetry,
  timing,
}: DriverInspectorProps) {
  const theme = useAppTheme();
  const palette = useTelemetryPalette();
  const fastestDriver = drivers.find(
    ({ id }) => id === overallFastestLap?.driverId,
  );
  const gQuality = formatSample(telemetry.gForceQuality, formatGQuality);
  const hasEstimatedG =
    telemetry.gForceQuality.status === 'available' &&
    telemetry.gForceQuality.value !== 'unavailable';
  const unavailableG: SampleValue<number> = {
    reason: 'missing',
    status: 'unavailable',
  };
  const longitudinalG = hasEstimatedG ? telemetry.longitudinalG : unavailableG;
  const lateralG = hasEstimatedG ? telemetry.lateralG : unavailableG;
  const speed = formatSample(
    telemetry.speedKph,
    (value) => `${Math.round(value)}`,
  );
  const throttle =
    telemetry.throttlePercent.status === 'available'
      ? telemetry.throttlePercent.value
      : null;
  const brake =
    telemetry.brakeApplied.status === 'available'
      ? telemetry.brakeApplied.value
      : null;
  let brakeLabel = 'Unavailable';
  if (brake === true) brakeLabel = 'Applied';
  if (brake === false) brakeLabel = 'Not applied';

  return (
    <ChromeSurface
      accessibilityLabel={`${driver.name} details`}
      style={[
        styles.panel,
        presentation === 'side' ? styles.side : styles.bottom,
        { borderTopColor: driver.teamColor },
      ]}
      testID="driver-inspector"
      variant="panel"
    >
      <View style={styles.header}>
        <View style={[styles.teamDot, { backgroundColor: driver.teamColor }]} />
        <View style={styles.identity}>
          <ThemedText accessibilityRole="header" style={styles.driverName}>
            {driver.driverNumber} · {driver.code}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            style={styles.driverMeta}
            tone="secondary"
          >
            {driver.name} · {driver.teamName}
          </ThemedText>
        </View>
        <View
          style={[
            styles.liveBadge,
            { backgroundColor: `${palette.positive}20` },
          ]}
        >
          <View
            style={[styles.liveDot, { backgroundColor: palette.positive }]}
          />
          <ThemedText color={palette.positive} style={styles.liveLabel}>
            Live
          </ThemedText>
        </View>
        <IconButton accessibilityLabel="Close driver details" onPress={onClose}>
          <ThemedText style={styles.close}>×</ThemedText>
        </IconButton>
      </View>

      <View style={styles.body}>
        <View style={styles.hero}>
          <View
            accessible
            accessibilityLabel={
              speed === 'Unavailable' ? 'Speed unavailable' : `${speed} km/h`
            }
            style={styles.speed}
          >
            <ThemedText
              color={palette.info}
              numberOfLines={1}
              style={styles.speedValue}
              testID="telemetry-speed"
            >
              {speed}
            </ThemedText>
            <ThemedText style={styles.speedUnit} tone="secondary">
              km/h
            </ThemedText>
          </View>
          <View style={styles.quickValues}>
            <ValueCell
              color={palette.warning}
              label="Gear"
              value={formatSample(telemetry.gear, (value) =>
                value === 0 ? 'N' : String(value),
              )}
            />
            <ValueCell
              label="RPM"
              value={formatSample(telemetry.rpm, (value) =>
                Math.round(value).toLocaleString('en-US'),
              )}
            />
            <ValueCell
              color={brake ? theme.colors.accent : palette.positive}
              label="Brake"
              testID="telemetry-brake"
              value={brakeLabel}
            />
            <ValueCell
              color={palette.purple}
              label="DRS"
              value={formatSample(telemetry.drs, String)}
            />
          </View>
        </View>

        <SignalMeter
          color={palette.positive}
          label="Throttle"
          progress={throttle === null ? null : throttle / 100}
          testID="telemetry-throttle-fill"
          value={throttle === null ? 'Unavailable' : `${Math.round(throttle)}%`}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText style={styles.sectionTitle}>G-force</ThemedText>
            <ThemedText style={styles.quality} tone="secondary">
              {gQuality}
            </ThemedText>
          </View>
          <SignedMeter
            label="Longitudinal"
            negativeColor={theme.colors.accent}
            positiveColor={palette.positive}
            sample={longitudinalG}
          />
          <SignedMeter
            label="Lateral"
            negativeColor={palette.info}
            positiveColor={palette.purple}
            sample={lateralG}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText style={styles.sectionTitle}>Timing</ThemedText>
            <ThemedText style={styles.currentLap} tone="secondary">
              {timing.currentLap
                ? `Lap ${timing.currentLap.lapNumber}`
                : 'Lap unavailable'}
            </ThemedText>
          </View>
          <View style={styles.sectors}>
            {timing.currentSectorsMs.map((sectorMs, index) => (
              <ValueCell
                color={sectorMs === null ? undefined : palette.purple}
                key={`sector-${index + 1}`}
                label={`S${index + 1}`}
                value={formatLapTime(sectorMs)}
              />
            ))}
          </View>
          <View style={styles.laps}>
            <ValueCell
              label="Last"
              value={formatLapTime(timing.lastLap?.durationMs)}
            />
            <ValueCell
              color={palette.purple}
              label="Personal best"
              value={formatBestLap(timing, overallFastestLap)}
            />
            <ValueCell
              color={theme.colors.accent}
              label="Overall"
              value={
                overallFastestLap
                  ? `${formatLapTime(overallFastestLap.durationMs)} · ${fastestDriver?.code ?? 'Unknown driver'}`
                  : 'Unavailable'
              }
            />
          </View>
        </View>
      </View>
    </ChromeSurface>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  bottom: {
    left: spacing.sm,
    maxWidth: 360,
    right: spacing.sm,
    top: spacing.sm,
  },
  close: {
    fontSize: 24,
    lineHeight: 26,
  },
  currentLap: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  driverMeta: {
    fontSize: 12,
  },
  driverName: {
    fontSize: 18,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.4,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  hero: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  laps: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  liveBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metricLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: typography.weight.medium,
  },
  panel: {
    borderTopWidth: 3,
    maxHeight: '96%',
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 5,
  },
  quality: {
    fontSize: 11,
  },
  quickValues: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectors: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  side: {
    right: spacing.sm,
    top: spacing.sm,
    width: 352,
  },
  signal: {
    gap: spacing.xs,
  },
  signalCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signalFill: {
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  signalLabel: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  signalTrack: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 7,
    overflow: 'hidden',
  },
  signalValue: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: typography.weight.medium,
  },
  signedCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signedFill: {
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  signedMeter: {
    gap: spacing.xs,
  },
  signedTrack: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 7,
    overflow: 'hidden',
    position: 'relative',
  },
  signedValue: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: typography.weight.medium,
  },
  speed: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 96,
  },
  speedUnit: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  speedValue: {
    fontSize: 36,
    fontVariant: ['tabular-nums'],
    fontWeight: typography.weight.medium,
    letterSpacing: -1.5,
    lineHeight: 38,
  },
  teamDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  valueCell: {
    flex: 1,
    gap: 2,
    minWidth: 64,
  },
  zeroLine: {
    bottom: 0,
    left: '50%',
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
});
