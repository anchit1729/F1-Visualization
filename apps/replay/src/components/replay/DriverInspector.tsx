import type { Driver, FastestLap } from '@f1/domain';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import type {
  DriverTimingFrame,
  SampleValue,
  TelemetryFrame,
} from '../../features/replay/frameSelectors';
import { useAccessibilityPreferences } from '../../theme/useAccessibilityPreferences';
import { useAppTheme } from '../../theme/useAppTheme';
import { spacing, typography } from '../../theme/tokens';
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
  return quality === 'low' ? 'Low-confidence estimate' : 'Estimated';
}

type MetricProps = {
  label: string;
  value: string;
};

function Metric({ label, value }: MetricProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metric, { borderColor: theme.colors.border }]}>
      <ThemedText style={styles.metricLabel} tone="secondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.metricValue}>{value}</ThemedText>
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
  const { isReduceMotionEnabled } = useAccessibilityPreferences();
  const fastestDriver = drivers.find(
    ({ id }) => id === overallFastestLap?.driverId,
  );
  const gQuality = formatSample(telemetry.gForceQuality, formatGQuality);
  const hasEstimatedG =
    telemetry.gForceQuality.status === 'available' &&
    telemetry.gForceQuality.value !== 'unavailable';

  const panel = (
    <ChromeSurface
      accessibilityLabel={`${driver.name} details`}
      style={[
        styles.panel,
        presentation === 'side' ? styles.side : styles.bottom,
      ]}
      testID="driver-inspector"
      variant="panel"
    >
      <View style={styles.header}>
        <View
          style={[styles.teamStripe, { backgroundColor: driver.teamColor }]}
        />
        <View style={styles.identity}>
          <ThemedText accessibilityRole="header" style={styles.driverName}>
            {driver.driverNumber} · {driver.code}
          </ThemedText>
          <ThemedText tone="secondary">
            {driver.name} · {driver.teamName}
          </ThemedText>
        </View>
        <IconButton accessibilityLabel="Close driver details" onPress={onClose}>
          <ThemedText style={styles.close}>×</ThemedText>
        </IconButton>
      </View>

      <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Live telemetry · sourced
          </ThemedText>
          <View style={styles.metrics}>
            <Metric
              label="Speed"
              value={formatSample(
                telemetry.speedKph,
                (value) => `${Math.round(value)} km/h`,
              )}
            />
            <Metric
              label="Throttle"
              value={formatSample(
                telemetry.throttlePercent,
                (value) => `${Math.round(value)}%`,
              )}
            />
            <Metric
              label="Brake"
              value={formatSample(telemetry.brakeApplied, (value) =>
                value ? 'Applied' : 'Not applied',
              )}
            />
            <Metric
              label="Gear"
              value={formatSample(telemetry.gear, (value) =>
                value === 0 ? 'N' : String(value),
              )}
            />
            <Metric
              label="RPM"
              value={formatSample(telemetry.rpm, (value) =>
                Math.round(value).toLocaleString('en-US'),
              )}
            />
            <Metric label="DRS" value={formatSample(telemetry.drs, String)} />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Estimated g-force</ThemedText>
          <ThemedText style={styles.quality} tone="secondary">
            {gQuality}
          </ThemedText>
          <View style={styles.metrics}>
            <Metric
              label="Longitudinal"
              value={
                hasEstimatedG
                  ? formatSample(
                      telemetry.longitudinalG,
                      (value) => `${value.toFixed(2)} g`,
                    )
                  : 'Unavailable'
              }
            />
            <Metric
              label="Lateral"
              value={
                hasEstimatedG
                  ? formatSample(
                      telemetry.lateralG,
                      (value) => `${value.toFixed(2)} g`,
                    )
                  : 'Unavailable'
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Timing</ThemedText>
          <View style={styles.metrics}>
            <Metric
              label="Current lap"
              value={
                timing.currentLap
                  ? `Lap ${timing.currentLap.lapNumber}`
                  : 'Unavailable'
              }
            />
            {timing.currentSectorsMs.map((sectorMs, index) => (
              <Metric
                key={`sector-${index + 1}`}
                label={`Sector ${index + 1}`}
                value={formatLapTime(sectorMs)}
              />
            ))}
            <Metric
              label="Last lap"
              value={formatLapTime(timing.lastLap?.durationMs)}
            />
            <Metric
              label="Personal best"
              value={formatBestLap(timing, overallFastestLap)}
            />
            <Metric
              label="Overall fastest"
              value={
                overallFastestLap
                  ? `${formatLapTime(overallFastestLap.durationMs)} · ${fastestDriver?.code ?? 'Unknown driver'}`
                  : 'Unavailable'
              }
            />
          </View>
        </View>

        <ThemedText style={styles.note} tone="secondary">
          Brake is an on/off source signal. G-force values are estimates derived
          from speed and trajectory.
        </ThemedText>
      </ScrollView>
    </ChromeSurface>
  );

  if (presentation === 'side') return panel;
  return (
    <Modal
      animationType={isReduceMotionEnabled ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View
        accessibilityViewIsModal
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
      >
        {panel}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottom: {
    maxHeight: '82%',
    width: '100%',
  },
  close: {
    fontSize: 24,
    lineHeight: 26,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.md,
  },
  driverName: {
    fontSize: 20,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.4,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  identity: {
    flex: 1,
    gap: spacing.xs,
  },
  metric: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 120,
    paddingTop: spacing.sm,
  },
  metricLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: typography.body,
    fontVariant: ['tabular-nums'],
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
  },
  panel: {
    maxHeight: 720,
  },
  quality: {
    fontSize: 13,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  side: {
    alignSelf: 'flex-start',
    width: 340,
  },
  teamStripe: {
    alignSelf: 'stretch',
    width: 4,
  },
});
