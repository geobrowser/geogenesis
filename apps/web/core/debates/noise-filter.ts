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
      await stopProcessorSafely(audioTrack, sourceMediaStreamTrack, 'after the connection changed');
      return null;
    }
    // The swap must not un-mute a muted microphone.
    audioTrack.mediaStreamTrack.enabled = sourceMediaStreamTrack.enabled;
    await processor.setEnabled(enabled);
    if (!isCurrent()) {
      await stopProcessorSafely(audioTrack, sourceMediaStreamTrack, 'after the connection changed');
      return null;
    }
    return { status: enabled ? 'enabled' : 'disabled', processor, sourceMediaStreamTrack };
  } catch (error) {
    // Who owns the processor decides how to undo it, and only LiveKit knows: `setProcessor` assigns
    // it before awaiting the sender swap, so a rejection can leave LiveKit holding one this never
    // saw attached. Destroying that one behind LiveKit's back leaves it publishing a dead track;
    // calling `stopProcessor` for one it never took leaves ours running.
    if (processor && audioTrack.getProcessor?.() === processor) {
      await stopProcessorSafely(audioTrack, sourceMediaStreamTrack, 'after initialization');
    } else {
      await processor?.destroy().catch(destroyError => {
        console.warn('[DebateNoiseFilter] Krisp cleanup failed after initialization.', destroyError);
      });
    }
    console.warn('[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.', error);
    return { status: 'failed', processor: null, sourceMediaStreamTrack };
  }
}

/**
 * Takes Krisp off the track, and puts the raw microphone back on the sender directly if that
 * failed.
 *
 * LiveKit stops the processed track *before* it swaps the sender back to the raw one, with
 * `processor.destroy()` and `applyConstraints()` in between (`internalStopProcessor`). A rejection
 * there leaves the sender publishing a stopped track: silence, while the room stays connected and
 * the microphone reads unmuted — the failure this module exists to prevent, reached through the
 * cleanup meant to prevent it.
 *
 * Nothing in LiveKit's public API repairs the track itself: `replaceTrack` no-ops because the raw
 * track it would restore is already `_mediaStreamTrack`, `restartTrack` re-attaches the leftover
 * processor when `destroy()` is what rejected, and `setMediaStreamTrack` is private. The sender is
 * public, though, and the raw track is never the one stopped, so putting it back is a single call
 * that skips LiveKit's processor bookkeeping entirely.
 */
async function stopProcessorSafely(audioTrack: LocalTrackLike, sourceMediaStreamTrack: MediaStreamTrack, when: string) {
  try {
    await audioTrack.stopProcessor?.();
    return;
  } catch (stopError) {
    console.warn(`[DebateNoiseFilter] Krisp cleanup failed ${when}.`, stopError);
  }

  // The track captured before the swap, not `audioTrack.mediaStreamTrack`: that is a getter
  // returning the processor's output whenever one is attached, and a cleanup that failed at
  // `destroy()` leaves one attached — so reading it here would hand the sender back the very track
  // that was just stopped.
  const sender = audioTrack.sender;
  if (!sender || sourceMediaStreamTrack.readyState === 'ended') {
    console.warn('[DebateNoiseFilter] The microphone could not be restored after a failed cleanup.');
    return;
  }

  try {
    // `enabled` already carries mute, and swapping the sender's track does not touch it.
    await sender.replaceTrack(sourceMediaStreamTrack);
    console.warn('[DebateNoiseFilter] Put the browser microphone back on the sender after a failed cleanup.');
  } catch (repairError) {
    console.warn('[DebateNoiseFilter] The microphone could not be restored after a failed cleanup.', repairError);
  }
}
