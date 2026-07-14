export type FeedbackEvent =
  | 'complete'
  | 'pause'
  | 'play'
  | 'scrub'
  | 'selection';

export type FeedbackPort = {
  trigger: (event: FeedbackEvent) => Promise<void> | void;
};

type FeedbackControllerOptions = {
  clock?: () => number;
  debounceMs?: number;
  isEnabled?: boolean;
  onError?: (error: unknown) => void;
};

export const noOpFeedbackPort: FeedbackPort = {
  trigger: () => undefined,
};

export function createFeedbackController(
  port: FeedbackPort,
  {
    clock = Date.now,
    debounceMs = 100,
    isEnabled = true,
    onError = () => undefined,
  }: FeedbackControllerOptions = {},
) {
  const lastTriggeredAt = new Map<FeedbackEvent, number>();

  return {
    trigger(event: FeedbackEvent, isInteractionEnabled = true) {
      if (!isEnabled || !isInteractionEnabled) return;

      const now = clock();
      const previous = lastTriggeredAt.get(event);
      if (previous !== undefined && now - previous < debounceMs) return;
      lastTriggeredAt.set(event, now);

      try {
        Promise.resolve(port.trigger(event)).catch(onError);
      } catch (error) {
        onError(error);
      }
    },
  };
}
