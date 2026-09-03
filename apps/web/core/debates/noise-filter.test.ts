import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalTrackLike } from './media-session';
import { attachNoiseFilter } from './noise-filter';

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

/**
 * A microphone track whose `setProcessor` swaps in a processed track and records the processor as
 * LiveKit's, the way LiveKit's own does. `swapFails` throws after that assignment when
 * `assignsBeforeFailing` is set, which is LiveKit's real ordering: it takes ownership of the
 * processor and only then awaits the sender swap.
 */
function makeTrack({ enabled = true, swapFails = false, assignsBeforeFailing = false } = {}): TrackDouble {
  const source = { kind: 'audio', enabled, readyState: 'live' } as MediaStreamTrack;
  let held: unknown = undefined;
  const track = {
    mediaStreamTrack: source,
    sender: { replaceTrack: vi.fn(async () => undefined) },
    stop: vi.fn(),
    getProcessor: () => held,
    setProcessor: vi.fn(async (processor: unknown) => {
      if (swapFails) {
        if (assignsBeforeFailing) held = processor;
        throw new Error('worklet failed');
      }
      held = processor;
      track.mediaStreamTrack = { kind: 'audio', enabled: true } as MediaStreamTrack;
    }),
    stopProcessor: vi.fn(async () => {
      held = undefined;
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

  it('destroys a processor LiveKit never took', async () => {
    const track = makeTrack({ swapFails: true });
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(track.stopProcessor).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  // `setProcessor` assigns LiveKit's processor before awaiting the sender swap, so it can reject
  // with LiveKit already holding this one. Destroying it behind LiveKit's back would leave it
  // publishing a dead track; it has to be taken off through LiveKit instead.
  it('takes the processor off through LiveKit when it already owns one', async () => {
    const track = makeTrack({ swapFails: true, assignsBeforeFailing: true });
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  // The failure this exists for: the swap has happened, so a bare error would leave Krisp's output
  // as the published track. Taking the processor off puts the raw microphone back.
  it('takes Krisp back off when enabling it fails after the swap', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(track.mediaStreamTrack).toBe(attachment?.sourceMediaStreamTrack);
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
  });

  // LiveKit stops the processed track before it swaps the sender back, so a cleanup that rejects
  // in between leaves the sender publishing a stopped track: silence, with the room still
  // connected and the microphone reading unmuted. Putting the raw track back is the repair.
  it('puts the raw microphone on the sender when cleanup fails', async () => {
    mocks.setEnabled.mockRejectedValue(new Error('no audio context'));
    const track = makeTrack();
    const source = track.mediaStreamTrack;
    track.stopProcessor.mockRejectedValue(new Error('destroy failed'));

    const attachment = await attachNoiseFilter(track, { enabled: true, isCurrent: () => true });

    // The track captured before the swap, never the getter — with the processor still attached
    // that returns the stopped one.
    expect(track.sender!.replaceTrack).toHaveBeenCalledWith(source);
    expect(attachment).toMatchObject({ status: 'failed', processor: null });
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

    expect(attachment).toMatchObject({ status: 'failed', processor: null });
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
