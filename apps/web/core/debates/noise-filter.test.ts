import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalTrackLike } from './media-session';
import { type NoiseFilterAttachment, attachNoiseFilter, watchNoiseFilterContext } from './noise-filter';

const mocks = vi.hoisted(() => ({
  supported: vi.fn(() => true),
  setEnabled: vi.fn(() => Promise.resolve(undefined)),
  destroy: vi.fn(() => Promise.resolve()),
}));

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: mocks.supported,
  KrispNoiseFilter: () => ({ setEnabled: mocks.setEnabled, destroy: mocks.destroy }),
}));

type TrackDouble = LocalTrackLike & {
  setProcessor: ReturnType<typeof vi.fn>;
  stopProcessor: ReturnType<typeof vi.fn>;
};

/** An audio context whose state can be driven from the test. */
class FakeAudioContext extends EventTarget {
  state: AudioContextState = 'running';
  become(state: AudioContextState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

/**
 * A microphone track whose `setProcessor` initializes the processor and swaps in a processed
 * track, the way LiveKit's does.
 */
function makeTrack({ enabled = true, swapFails = false, audioContext = new FakeAudioContext() } = {}): TrackDouble {
  const source = { kind: 'audio', enabled, readyState: 'live' } as MediaStreamTrack;
  const track = {
    mediaStreamTrack: source,
    sender: { replaceTrack: vi.fn(async () => undefined) },
    stop: vi.fn(),
    setProcessor: vi.fn(async (processor: { init?: (options: unknown) => Promise<void> }) => {
      if (swapFails) throw new Error('worklet failed');
      await processor.init?.({ audioContext });
      track.mediaStreamTrack = { kind: 'audio', enabled: true } as MediaStreamTrack;
    }),
    stopProcessor: vi.fn(async () => {
      track.mediaStreamTrack = source;
    }),
  };
  return track as unknown as TrackDouble;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  mocks.supported.mockReset().mockReturnValue(true);
  mocks.setEnabled.mockReset().mockResolvedValue(undefined);
  mocks.destroy.mockReset().mockResolvedValue(undefined);
});

describe('attachNoiseFilter', () => {
  it('attaches Krisp and enables it', async () => {
    const track = makeTrack();
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(mocks.setEnabled).toHaveBeenCalledWith(true);
    expect(attachment).toMatchObject({ status: 'enabled' });
    expect(attachment?.processor).not.toBeNull();
  });

  // Krisp swaps in a fresh track, which is enabled by default; a muted microphone must not come
  // back on air because a filter was attached.
  it('carries a muted microphone across the swap', async () => {
    const track = makeTrack({ enabled: false });
    await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.mediaStreamTrack.enabled).toBe(false);
  });

  it('leaves the raw microphone alone where Krisp is unsupported', async () => {
    mocks.supported.mockReturnValue(false);
    const track = makeTrack();
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.setProcessor).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ status: 'unsupported', processor: null });
  });

  // Taking the swap back off is what makes a failure safe, so a track that cannot do it is left
  // on its raw microphone rather than handed a processor there is no way to remove.
  it('leaves the raw microphone alone where the swap could not be undone', async () => {
    const track = makeTrack();
    delete (track as Partial<TrackDouble>).stopProcessor;
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.setProcessor).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  it('destroys a processor that never attached', async () => {
    const track = makeTrack({ swapFails: true });
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(track.stopProcessor).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  // The failure this exists for: the swap has happened, so a bare error would leave Krisp's output
  // as the published track. Taking the processor off puts the raw microphone back.
  it('takes Krisp back off when enabling it fails after the swap', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(track.mediaStreamTrack.enabled).toBe(true);
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  // LiveKit stops the processed track before it swaps the sender back, so a cleanup that rejects
  // in between leaves the sender on a stopped track. Putting the raw one back is the repair.
  it('puts the raw microphone on the sender when cleanup fails', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    const source = track.mediaStreamTrack;
    track.stopProcessor.mockRejectedValue(new Error('destroy failed'));

    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.sender!.replaceTrack).toHaveBeenCalledWith(source);
    expect(attachment).toMatchObject({ status: 'failed' });
  });

  it('leaves the sender alone when cleanup succeeds', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(track.sender!.replaceTrack).not.toHaveBeenCalled();
  });

  // Nothing to repair with: publishing an ended track would be silence either way.
  it('does not put an ended microphone back on the sender', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    (track.mediaStreamTrack as { readyState: string }).readyState = 'ended';
    track.stopProcessor.mockRejectedValue(new Error('destroy failed'));

    await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.sender!.replaceTrack).not.toHaveBeenCalled();
  });

  it('survives a failed cleanup on a track that was never published', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    delete (track as { sender?: unknown }).sender;
    track.stopProcessor.mockRejectedValue(new Error('destroy failed'));

    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(attachment).toMatchObject({ status: 'failed' });
  });

  it('hands back the audio context LiveKit initialized Krisp with', async () => {
    const audioContext = new FakeAudioContext();
    const track = makeTrack({ audioContext });
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(attachment?.audioContext).toBe(audioContext);
  });

  it('cleans up and reports nothing when the caller moved on mid-attach', async () => {
    let current = true;
    const track = makeTrack();
    track.setProcessor.mockImplementation(async () => {
      current = false;
    });
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => current });

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(mocks.setEnabled).not.toHaveBeenCalled();
    expect(attachment).toBeNull();
  });
});

describe('watchNoiseFilterContext', () => {
  async function attached(audioContext: FakeAudioContext) {
    const track = makeTrack({ audioContext });
    const attachment = (await attachNoiseFilter(track, { enabled: true, isCurrent: () => true }))!;
    return { track, attachment };
  }

  // The silent-microphone case: Krisp keeps publishing from a context that no longer runs, and
  // nothing in LiveKit's connection state says so.
  it('takes Krisp back off when a running context stops', async () => {
    const audioContext = new FakeAudioContext();
    const { track, attachment } = await attached(audioContext);
    watchNoiseFilterContext(track, attachment);

    audioContext.become('suspended');

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    // The raw microphone is what publishes again, not Krisp's output.
    expect(track.mediaStreamTrack).toBe(attachment.sourceMediaStreamTrack);
  });

  // A dead context is itself a likely reason for Krisp's `destroy()` to reject, so this is the
  // cleanup most likely to strand the sender on the stopped track.
  it('puts the raw microphone on the sender when the fallback cleanup fails', async () => {
    const audioContext = new FakeAudioContext();
    const { track, attachment } = await attached(audioContext);
    track.stopProcessor.mockRejectedValue(new Error('destroy failed'));
    watchNoiseFilterContext(track, attachment);

    audioContext.become('suspended');

    await vi.waitFor(() => expect(track.sender!.replaceTrack).toHaveBeenCalledWith(attachment.sourceMediaStreamTrack));
  });

  it('falls back once, whatever the context does afterwards', async () => {
    const audioContext = new FakeAudioContext();
    const { track, attachment } = await attached(audioContext);
    watchNoiseFilterContext(track, attachment);

    audioContext.become('suspended');
    audioContext.become('running');
    audioContext.become('closed');

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
  });

  // Blocked autoplay: the context was never running, the user is about to click "Enable audio",
  // and the resume that follows is what makes Krisp work — not a reason to give it up.
  it('leaves a context alone that has not run yet', async () => {
    const audioContext = new FakeAudioContext();
    audioContext.state = 'suspended';
    const { track, attachment } = await attached(audioContext);
    watchNoiseFilterContext(track, attachment);

    audioContext.become('suspended');
    expect(track.stopProcessor).not.toHaveBeenCalled();

    // Once it has run, a later stop is the real thing.
    audioContext.become('running');
    audioContext.become('suspended');
    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
  });

  // The attach is asynchronous, so a stop landing inside it fires its event before anything is
  // listening. Reading the state at subscribe time would call that blocked autoplay and leave the
  // microphone silent, since no further event arrives while the context stays stopped.
  it('catches a context that stopped while Krisp was attaching', async () => {
    const audioContext = new FakeAudioContext();
    const { track, attachment } = await attached(audioContext);

    // No event: this is the transition that happened before the watch existed.
    audioContext.state = 'suspended';
    watchNoiseFilterContext(track, attachment);

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(track.mediaStreamTrack).toBe(attachment.sourceMediaStreamTrack);
  });

  // The same missed-event shape, but the context never ran, so it is still blocked autoplay.
  it('leaves a context that was never running alone on subscribe', async () => {
    const audioContext = new FakeAudioContext();
    audioContext.state = 'suspended';
    const { track, attachment } = await attached(audioContext);
    watchNoiseFilterContext(track, attachment);

    expect(track.stopProcessor).not.toHaveBeenCalled();
  });

  it('stops watching once unsubscribed', async () => {
    const audioContext = new FakeAudioContext();
    const { track, attachment } = await attached(audioContext);
    const unwatch = watchNoiseFilterContext(track, attachment);

    unwatch();
    audioContext.become('suspended');

    expect(track.stopProcessor).not.toHaveBeenCalled();
  });

  it('does nothing without an attached processor', async () => {
    const track = makeTrack();
    const attachment: NoiseFilterAttachment = {
      status: 'failed',
      processor: null,
      sourceMediaStreamTrack: track.mediaStreamTrack,
      audioContext: null,
      audioContextRan: false,
    };

    expect(() => watchNoiseFilterContext(track, attachment)()).not.toThrow();
  });
});
