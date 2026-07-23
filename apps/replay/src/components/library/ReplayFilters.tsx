import { Pressable, StyleSheet, View } from 'react-native';

import type {
  ReplayScopeFilter,
  ReplayYearFilter,
} from '../../features/catalog/libraryModel';
import { useAppTheme } from '../../theme/useAppTheme';
import { useLiquidGlass } from '../../theme/useLiquidGlass';
import { motion, radius, spacing, typography } from '../../theme/tokens';
import ChromeSurface from '../ui/ChromeSurface';
import FocusRing from '../ui/FocusRing';
import ThemedText from '../ui/ThemedText';
import {
  shouldScaleControl,
  useControlFeedback,
} from '../ui/useControlFeedback';

type FilterChipProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
};

function FilterChip({ label, onPress, selected }: FilterChipProps) {
  const theme = useAppTheme();
  const useGlass = useLiquidGlass();
  const { handleBlur, handleFocus, isFocused, isReduceMotionEnabled } =
    useControlFeedback();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        !useGlass && {
          backgroundColor: selected
            ? theme.colors.accent
            : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        },
        useGlass &&
          selected && {
            backgroundColor: theme.colors.accent,
            borderColor: theme.colors.accent,
          },
        useGlass && selected && styles.selectedGlassChip,
        useGlass && !selected && styles.glassChip,
        pressed && !useGlass && styles.pressed,
        useGlass &&
          shouldScaleControl(pressed, isReduceMotionEnabled) &&
          styles.glassPressed,
      ]}
    >
      {useGlass && !selected ? (
        <ChromeSurface
          interactive
          style={styles.glassSurface}
          variant="control"
        >
          <ThemedText style={styles.chipLabel}>{label}</ThemedText>
        </ChromeSurface>
      ) : (
        <ThemedText
          style={styles.chipLabel}
          tone={selected ? 'on-accent' : 'primary'}
        >
          {label}
        </ThemedText>
      )}
      <FocusRing visible={isFocused} />
    </Pressable>
  );
}

type ReplayFiltersProps = {
  onScopeChange: (scope: ReplayScopeFilter) => void;
  onYearChange: (year: ReplayYearFilter) => void;
  scope: ReplayScopeFilter;
  year: ReplayYearFilter;
  years: number[];
};

export default function ReplayFilters({
  onScopeChange,
  onYearChange,
  scope,
  year,
  years,
}: ReplayFiltersProps) {
  return (
    <ChromeSurface
      accessibilityLabel="Replay filters"
      style={styles.surface}
      variant="chrome"
    >
      <View style={styles.group}>
        <ThemedText style={styles.groupLabel} tone="secondary">
          Scope
        </ThemedText>
        <View style={styles.options}>
          {(['all', 'race', 'lap'] as const).map((option) => (
            <FilterChip
              key={option}
              label={
                option === 'all'
                  ? 'All'
                  : `${option[0].toUpperCase()}${option.slice(1)}`
              }
              onPress={() => onScopeChange(option)}
              selected={scope === option}
            />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <ThemedText style={styles.groupLabel} tone="secondary">
          Year
        </ThemedText>
        <View style={styles.options}>
          <FilterChip
            label="All years"
            onPress={() => onYearChange('all')}
            selected={year === 'all'}
          />
          {years.map((option) => (
            <FilterChip
              key={option}
              label={String(option)}
              onPress={() => onYearChange(option)}
              selected={year === option}
            />
          ))}
        </View>
      </View>
    </ChromeSurface>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    position: 'relative',
  },
  chipLabel: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.2,
  },
  group: {
    gap: spacing.xs,
  },
  glassChip: {
    borderRadius: radius.pill,
    borderColor: 'transparent',
    paddingHorizontal: 0,
  },
  glassPressed: {
    transform: [{ scale: motion.pressedScale }],
  },
  glassSurface: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.72,
  },
  selectedGlassChip: {
    borderRadius: radius.pill,
  },
  surface: {
    gap: spacing.md,
    padding: spacing.md,
  },
});
