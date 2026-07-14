import * as Haptics from 'expo-haptics';

import {
  F1Haptics,
  type HapticTextureDefinition,
} from '../../../modules/f1-haptics';
import type { FeedbackPort } from './feedback';
import { hapticTextureForFeedback } from './hapticPatterns';

type NativeFeedbackEffects = {
  complete: () => Promise<void>;
  impact: () => Promise<void>;
  isTextureSupported?: () => boolean;
  playTexture?: (texture: HapticTextureDefinition) => Promise<void>;
  selection: () => Promise<void>;
};

export function createNativeFeedbackPort(
  effects: NativeFeedbackEffects,
): FeedbackPort {
  return {
    trigger(event) {
      if (effects.isTextureSupported?.() && effects.playTexture) {
        return effects.playTexture(hapticTextureForFeedback(event));
      }
      if (event === 'selection' || event === 'scrub') {
        return effects.selection();
      }
      if (event === 'complete') return effects.complete();
      return effects.impact();
    },
  };
}

export const nativeFeedbackPort = createNativeFeedbackPort({
  complete: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  isTextureSupported: () => F1Haptics?.isSupported() ?? false,
  playTexture: (texture) =>
    F1Haptics?.playPattern(texture) ?? Promise.resolve(),
  selection: Haptics.selectionAsync,
});

export default nativeFeedbackPort;
