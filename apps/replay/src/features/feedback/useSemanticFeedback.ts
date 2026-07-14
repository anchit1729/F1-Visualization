import { useCallback } from 'react';

import { useAccessibilityPreferences } from '../../theme/useAccessibilityPreferences';
import { createFeedbackController, type FeedbackEvent } from './feedback';
import feedbackPort from './feedbackAdapter';

const feedbackController = createFeedbackController(feedbackPort);

export default function useSemanticFeedback(isFeedbackEnabled = true) {
  const { isReduceMotionEnabled } = useAccessibilityPreferences();

  return useCallback(
    (event: FeedbackEvent) => {
      feedbackController.trigger(
        event,
        isFeedbackEnabled && !isReduceMotionEnabled,
      );
    },
    [isFeedbackEnabled, isReduceMotionEnabled],
  );
}
