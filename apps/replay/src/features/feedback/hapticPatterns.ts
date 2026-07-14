import type { HapticTextureDefinition } from '../../../modules/f1-haptics';
import type { FeedbackEvent } from './feedback';

export type HapticTextureId =
  | 'confirmation'
  | 'playback-start'
  | 'playback-stop'
  | 'scrub-detent'
  | 'selection';

export const hapticTextureIdByFeedback = {
  complete: 'confirmation',
  pause: 'playback-stop',
  play: 'playback-start',
  scrub: 'scrub-detent',
  selection: 'selection',
} satisfies Record<FeedbackEvent, HapticTextureId>;

// Starter values only. Tune these on a physical device or replace them from a
// future Haptic Lab; UI components should continue emitting semantic events.
export const hapticTextures: Record<HapticTextureId, HapticTextureDefinition> =
  {
    confirmation: {
      id: 'confirmation',
      events: [
        { intensity: 0.4, sharpness: 0.35, startMs: 0, type: 'transient' },
        { intensity: 0.7, sharpness: 0.7, startMs: 90, type: 'transient' },
      ],
    },
    'playback-start': {
      id: 'playback-start',
      events: [
        { intensity: 0.55, sharpness: 0.75, startMs: 0, type: 'transient' },
      ],
    },
    'playback-stop': {
      id: 'playback-stop',
      events: [
        { intensity: 0.4, sharpness: 0.2, startMs: 0, type: 'transient' },
      ],
    },
    'scrub-detent': {
      id: 'scrub-detent',
      events: [
        { intensity: 0.18, sharpness: 0.85, startMs: 0, type: 'transient' },
      ],
    },
    selection: {
      id: 'selection',
      events: [
        { intensity: 0.3, sharpness: 0.6, startMs: 0, type: 'transient' },
      ],
    },
  };

export function hapticTextureForFeedback(event: FeedbackEvent) {
  return hapticTextures[hapticTextureIdByFeedback[event]];
}
