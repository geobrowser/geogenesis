import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import type { AudioProcessorOptions } from 'livekit-client';

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
  /** The context Krisp's worklet runs on, as LiveKit handed it over; null when nothing attached. */
  audioContext: AudioContext | null;
  /** Whether that context was running when Krisp was initialized on it. */
  audioContextRan: boolean;
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
    return { status: 'failed', processor: null, sourceMediaStreamTrack, audioContext: null, audioContextRan: false };
  }

  let processor: KrispNoiseFilterProcessor | null = null;
  let processorAttached = false;
  let audioContext: AudioContext | null = null;
  let audioContextRan = false;
  try {
    const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
    if (!isCurrent()) return null;
    if (!isKrispNoiseFilterSupported()) {
      console.info('[DebateNoiseFilter] Krisp is unavailable in this browser; using the browser microphone track.');
      return {
        status: 'unsupported',
        processor: null,
        sourceMediaStreamTrack,
        audioContext: null,
        audioContextRan: false,
      };
    }

    processor = KrispNoiseFilter();
    // LiveKit keeps its audio context to itself; the one public place it passes through is the
    // processor's own `init`. Kept so `watchNoiseFilterContext` can tell when it stops running.
    const originalInit = processor.init;
    processor.init = async (options: AudioProcessorOptions) => {
      audioContext = options.audioContext ?? null;
      // Sampled here, not at watch time: the rest of the attach is asynchronous, and a context that
      // stops during it has already fired its `statechange` by the time anything can subscribe.
      audioContextRan = audioContext?.state === 'running';
      if (originalInit) await originalInit.call(processor, options);
    };
    await audioTrack.setProcessor(processor);
    processorAttached = true;
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
    return {
      status: enabled ? 'enabled' : 'disabled',
      processor,
      sourceMediaStreamTrack,
      audioContext,
      audioContextRan,
    };
  } catch (error) {
    if (processorAttached) {
      await stopProcessorSafely(audioTrack, sourceMediaStreamTrack, 'after initialization');
    } else {
      await processor?.destroy().catch(destroyError => {
        console.warn('[DebateNoiseFilter] Krisp cleanup failed after initialization.', destroyError);
      });
    }
    console.warn('[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.', error);
    return { status: 'failed', processor: null, sourceMediaStreamTrack, audioContext: null, audioContextRan: false };
  }
}

/**
 * Takes Krisp back off if the audio context it runs on stops running after it was up — a phone
 * call, another app taking the audio session, a backgrounded mobile browser. The worklet then
 * produces silence, and nothing else notices: LiveKit only reads the context's state at connect,
 * so the room stays "connected", the mute flag stays "unmuted", and the other side hears nothing.
 * Stopping the processor puts the raw microphone back on the sender.
 *
 * A context that has not run *yet* is left alone: that is the blocked-autoplay case, where the
 * user is about to click "Enable audio" and the resume is on its way.
 *
 * LiveKit re-syncs the raw track's `enabled` against the track's own mute state as it swaps back,
 * so a muted microphone stays muted.
 *
 * Not for surfaces recording the processed track — stopping it ends their capture. Returns the
 * unsubscribe.
 */
export function watchNoiseFilterContext(audioTrack: LocalTrackLike, attachment: NoiseFilterAttachment): () => void {
  const context = attachment.audioContext;
  if (!context || !attachment.processor) return () => undefined;

  let ran = attachment.audioContextRan || context.state === 'running';
  const handleStateChange = () => {
    if (context.state === 'running') {
      ran = true;
      return;
    }
    if (!ran) return;
    unsubscribe();
    console.warn('[DebateNoiseFilter] The audio context stopped running; using the browser microphone track.');
    // The context dying is a likely reason for Krisp's own `destroy()` to reject, so this is the
    // cleanup most in need of the sender repair.
    void stopProcessorSafely(audioTrack, attachment.sourceMediaStreamTrack, 'after the audio context stopped');
  };
  const unsubscribe = () => context.removeEventListener('statechange', handleStateChange);
  context.addEventListener('statechange', handleStateChange);
  // A context that ran during the attach and is no longer running stopped while nothing was
  // listening; its event is gone, and no further one is coming while it stays stopped.
  if (ran && context.state !== 'running') handleStateChange();
  return unsubscribe;
}

/**
 * Takes Krisp off the track, and puts the raw microphone back on the sender directly if that
 * failed. Returns whether the microphone is publishing again.
 *
 * LiveKit stops the processed track *before* it swaps the sender back to the raw one, with two
 * awaits in between that can reject (`internalStopProcessor`: `processedTrack.stop()`, then
 * `processor.destroy()` and `applyConstraints()`, then the swap). A rejection there leaves the
 * sender publishing a stopped track — silence, while the room stays connected and the microphone
 * reads unmuted. It is the failure this module exists to prevent, reached through the cleanup meant
 * to prevent it.
 *
 * Nothing in LiveKit's public API repairs the track itself: `replaceTrack` no-ops because the raw
 * track it would restore is already `_mediaStreamTrack`, `restartTrack` re-attaches the leftover
 * processor when `destroy()` is what rejected, and `setMediaStreamTrack` is private. The sender is
 * public, though, and the raw track is never the one that gets stopped — so putting it back on the
 * sender is a single call, and skips LiveKit's processor bookkeeping entirely.
 */
async function stopProcessorSafely(
  audioTrack: LocalTrackLike,
  sourceMediaStreamTrack: MediaStreamTrack,
  when: string
): Promise<boolean> {
  try {
    await audioTrack.stopProcessor?.();
    return true;
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
    return false;
  }

  try {
    // `enabled` already carries mute, and swapping the sender's track does not touch it.
    await sender.replaceTrack(sourceMediaStreamTrack);
    console.warn('[DebateNoiseFilter] Put the browser microphone back on the sender after a failed cleanup.');
    return true;
  } catch (repairError) {
    console.warn('[DebateNoiseFilter] The microphone could not be restored after a failed cleanup.', repairError);
    return false;
  }
}
