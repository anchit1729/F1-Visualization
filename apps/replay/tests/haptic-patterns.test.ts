import type { FeedbackEvent } from '../src/features/feedback/feedback';
import {
  hapticTextureForFeedback,
  hapticTextureIdByFeedback,
  hapticTextures,
} from '../src/features/feedback/hapticPatterns';

const feedbackEvents: FeedbackEvent[] = [
  'complete',
  'pause',
  'play',
  'scrub',
  'selection',
];

describe('haptic texture mapping', () => {
  test.each(feedbackEvents)('maps %s to a named texture', (event) => {
    expect(hapticTextureForFeedback(event).id).toBe(
      hapticTextureIdByFeedback[event],
    );
  });

  test('keeps starter texture values in the shared safe ranges', () => {
    Object.values(hapticTextures).forEach(({ events }) => {
      expect(events.length).toBeGreaterThan(0);
      events.forEach(({ durationMs, intensity, sharpness, startMs, type }) => {
        expect(intensity).toBeGreaterThanOrEqual(0);
        expect(intensity).toBeLessThanOrEqual(1);
        expect(sharpness).toBeGreaterThanOrEqual(0);
        expect(sharpness).toBeLessThanOrEqual(1);
        expect(startMs).toBeGreaterThanOrEqual(0);
        if (type === 'continuous') {
          expect(durationMs).toBeGreaterThan(0);
        }
      });
    });
  });
});
