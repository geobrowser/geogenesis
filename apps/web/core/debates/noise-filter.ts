import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import type { LocalTrackLike } from './media-session';

export type DebateNoiseFilterStatus = 'initializing' | 'enabled' | 'disabled' | 'unsupported' | 'failed';

export const debateNoiseFilterStatusLabel: Record<DebateNoiseFilterStatus, string> = {
  initializing: 'Loading…',
  enabled: 'On',
  disabled: 'Off',
  unsupported: 'Unavailable',
  failed: 'Failed',
};

export type NoiseFilterAttachment = {
  status: Exclude<DebateNoiseFilterStatus, 'initializing'>;
  processor: KrispNoiseFilterProcessor | null;
  /** The raw microphone track Krisp was put in front of, for callers that mute both. */
  sourceMediaStreamTrack: MediaStreamTrack;
};

/**
 * Puts Krisp in front of a local microphone track, and takes it back off on any failure so the raw
 * microphone keeps publishing. Shared by the debate room and the claim-exploration voice dock so
 * the two cannot drift: Krisp replaces the *published* track with its own output, and an output
 * that is silent reads as a microphone that is unmuted and carries nothing.
 *
 * Returns null when `isCurrent` turned false along the way — the caller has moved on, and whatever
 * was attached has been cleaned up.
 */
export async function attachNoiseFilter(
  audioTrack: LocalTrackLike,
  { enabled, isCurrent }: { enabled: boolean; isCurrent: () => boolean }
): Promise<NoiseFilterAttachment | null> {
  const sourceMediaStreamTrack = audioTrack.mediaStreamTrack;
  // Both, not just `setProcessor`: rolling the swap back is what keeps a failure from leaving
  // Krisp's output published, so a track that cannot stop a processor does not get one.
  if (!audioTrack.setProcessor || !audioTrack.stopProcessor) {
    console.warn(
      '[DebateNoiseFilter] Krisp could not attach because the local microphone track does not process audio.'
    );
    return { status: 'failed', processor: null, sourceMediaStreamTrack };
  }

  let processor: KrispNoiseFilterProcessor | null = null;
  try {
    const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
    if (!isCurrent()) return null;
    if (!isKrispNoiseFilterSupported()) {
      console.info('[DebateNoiseFilter] Krisp is unavailable in this browser; using the browser microphone track.');
      return { status: 'unsupported', processor: null, sourceMediaStreamTrack };
    }

    processor = KrispNoiseFilter();
    await audioTrack.setProcessor(processor);
    if (!isCurrent()) {
      await stopProcessorQuietly(audioTrack, 'after the connection changed');
      return null;
    }
    // The swap must not un-mute a muted microphone.
    audioTrack.mediaStreamTrack.enabled = sourceMediaStreamTrack.enabled;
    await processor.setEnabled(enabled);
    if (!isCurrent()) {
      await stopProcessorQuietly(audioTrack, 'after the connection changed');
      return null;
    }
    return { status: enabled ? 'enabled' : 'disabled', processor, sourceMediaStreamTrack };
  } catch (error) {
    // Who owns the processor decides how to undo it, and only LiveKit knows: `setProcessor` assigns
    // it before awaiting the sender swap, so a rejection can leave LiveKit holding one this never
    // saw attached. Destroying that one behind LiveKit's back leaves it publishing a dead track;
    // calling `stopProcessor` for one it never took leaves ours running.
    if (processor && audioTrack.getProcessor?.() === processor) {
      await stopProcessorQuietly(audioTrack, 'after initialization');
    } else {
      await processor?.destroy().catch(destroyError => {
        console.warn('[DebateNoiseFilter] Krisp cleanup failed after initialization.', destroyError);
      });
    }
    console.warn('[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.', error);
    return { status: 'failed', processor: null, sourceMediaStreamTrack };
  }
}

async function stopProcessorQuietly(audioTrack: LocalTrackLike, when: string) {
  await audioTrack.stopProcessor?.().catch(stopError => {
    console.warn(`[DebateNoiseFilter] Krisp cleanup failed ${when}.`, stopError);
  });
}
