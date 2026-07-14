import { createNativeFeedbackPort } from '../src/features/feedback/feedbackAdapter.native';
import { hapticTextureForFeedback } from '../src/features/feedback/hapticPatterns';

const effects = {
  complete: jest.fn(() => Promise.resolve()),
  impact: jest.fn(() => Promise.resolve()),
  selection: jest.fn(() => Promise.resolve()),
};
const nativeFeedbackPort = createNativeFeedbackPort(effects);

describe('native feedback adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('maps selection and scrub to selection feedback', async () => {
    await nativeFeedbackPort.trigger('selection');
    await nativeFeedbackPort.trigger('scrub');
    expect(effects.selection).toHaveBeenCalledTimes(2);
  });

  test('maps playback controls to a light impact', async () => {
    await nativeFeedbackPort.trigger('play');
    await nativeFeedbackPort.trigger('pause');
    expect(effects.impact).toHaveBeenCalledTimes(2);
  });

  test('maps completion to a success notification', async () => {
    await nativeFeedbackPort.trigger('complete');
    expect(effects.complete).toHaveBeenCalledTimes(1);
  });

  test('prefers a supported authored texture over fallback effects', async () => {
    const playTexture = jest.fn(() => Promise.resolve());
    const texturedPort = createNativeFeedbackPort({
      ...effects,
      isTextureSupported: () => true,
      playTexture,
    });

    await texturedPort.trigger('play');

    expect(playTexture).toHaveBeenCalledWith(hapticTextureForFeedback('play'));
    expect(effects.impact).not.toHaveBeenCalled();
  });
});
