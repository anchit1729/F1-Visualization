import {
  createFeedbackController,
  noOpFeedbackPort,
  type FeedbackEvent,
  type FeedbackPort,
} from '../src/features/feedback/feedback';

describe('semantic feedback', () => {
  test('triggers each event and debounces repeated events', () => {
    let now = 0;
    const trigger = jest.fn<void, [FeedbackEvent]>();
    const controller = createFeedbackController(
      { trigger },
      { clock: () => now, debounceMs: 100 },
    );

    controller.trigger('scrub');
    now = 50;
    controller.trigger('scrub');
    controller.trigger('selection');
    now = 100;
    controller.trigger('scrub');

    expect(trigger.mock.calls).toEqual([['scrub'], ['selection'], ['scrub']]);
  });

  test('honors global and interaction preferences', () => {
    const port: FeedbackPort = { trigger: jest.fn() };
    createFeedbackController(port, { isEnabled: false }).trigger('play');
    createFeedbackController(port).trigger('pause', false);
    expect(port.trigger).not.toHaveBeenCalled();
  });

  test('keeps interaction errors behind the port boundary', async () => {
    const synchronousError = new Error('sync');
    const asynchronousError = new Error('async');
    const onError = jest.fn();
    const synchronous = createFeedbackController(
      {
        trigger: () => {
          throw synchronousError;
        },
      },
      { onError },
    );
    const asynchronous = createFeedbackController(
      { trigger: () => Promise.reject(asynchronousError) },
      { onError },
    );

    expect(() => synchronous.trigger('play')).not.toThrow();
    asynchronous.trigger('pause');
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(synchronousError);
    expect(onError).toHaveBeenCalledWith(asynchronousError);
  });

  test('provides an inert test and web port', () => {
    expect(() => noOpFeedbackPort.trigger('complete')).not.toThrow();
  });
});
