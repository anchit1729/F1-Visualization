export type ReplayScrubberProps = {
  disabled?: boolean;
  maximumMs: number;
  minimumMs: number;
  onCommit: (timeMs: number) => void;
  onPreview: (timeMs: number) => void;
  valueMs: number;
  valueText: string;
};
