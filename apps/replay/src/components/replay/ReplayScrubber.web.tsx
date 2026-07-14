import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useAppTheme } from '../../theme/useAppTheme';
import type { ReplayScrubberProps } from './ReplayScrubber.types';

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
  const [draftMs, setDraftMs] = useState(valueMs);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setDraftMs(valueMs);
  }, [valueMs]);

  const preview = ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(currentTarget.value);
    setDraftMs(nextValue);
    onPreview(nextValue);
  };
  const commit = (nextValue = draftMs) => {
    dragging.current = false;
    onCommit(nextValue);
  };

  return (
    <input
      aria-label="Replay position"
      aria-valuetext={valueText}
      data-testid="replay-scrubber"
      disabled={disabled}
      max={maximumMs}
      min={minimumMs}
      onBlur={() => commit()}
      onChange={preview}
      onKeyUp={({ currentTarget }) => commit(Number(currentTarget.value))}
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerUp={({ currentTarget }) => commit(Number(currentTarget.value))}
      step={1000}
      style={{
        accentColor: theme.colors.accent,
        cursor: disabled ? 'not-allowed' : 'pointer',
        height: 44,
        width: '100%',
      }}
      type="range"
      value={draftMs}
    />
  );
}
