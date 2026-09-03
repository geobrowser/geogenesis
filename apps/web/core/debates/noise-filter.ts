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
  if (!audioTrack.setProcessor) {
    console.warn('[DebateNoiseFilter] Krisp could not attach because the local microphone track is unavailable.');
    return { status: 'failed', processor: null, sourceMediaStreamTrack, audioContext: null };
  }

  let processor: KrispNoiseFilterProcessor | null = null;
  let processorAttached = false;
  let audioContext: AudioContext | null = null;
  try {
    const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
    if (!isCurrent()) return null;
    if (!isKrispNoiseFilterSupported()) {
      console.info('[DebateNoiseFilter] Krisp is unavailable in this browser; using the browser microphone track.');
      return { status: 'unsupported', processor: null, sourceMediaStreamTrack, audioContext: null };
    }

    processor = KrispNoiseFilter();
    // LiveKit keeps its audio context to itself; the one public place it passes through is the
    // processor's own `init`. Kept so `watchNoiseFilterContext` can tell when it stops running.
    const originalInit = processor.init;
    processor.init = async (options: AudioProcessorOptions) => {
      audioContext = options.audioContext ?? null;
      if (originalInit) await originalInit.call(processor, options);
    };
    await audioTrack.setProcessor(processor);
    processorAttached = true;
    if (!isCurrent()) {
      await stopProcessorQuietly(audioTrack);
      return null;
    }
    // The swap must not un-mute a muted microphone.
    audioTrack.mediaStreamTrack.enabled = sourceMediaStreamTrack.enabled;
    await processor.setEnabled(enabled);
    if (!isCurrent()) {
      await stopProcessorQuietly(audioTrack);
      return null;
    }
    return { status: enabled ? 'enabled' : 'disabled', processor, sourceMediaStreamTrack, audioContext };
  } catch (error) {
    const cleanup = processorAttached ? audioTrack.stopProcessor?.() : processor?.destroy();
    await cleanup?.catch(stopError => {
      console.warn('[DebateNoiseFilter] Krisp cleanup failed after initialization.', stopError);
    });
    console.warn('[DebateNoiseFilter] Krisp initialization failed; using the browser microphone track.', error);
    return { status: 'failed', processor: null, sourceMediaStreamTrack, audioContext: null };
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

  let ran = context.state === 'running';
  const handleStateChange = () => {
    if (context.state === 'running') {
      ran = true;
      return;
    }
    if (!ran) return;
    unsubscribe();
    console.warn('[DebateNoiseFilter] The audio context stopped running; using the browser microphone track.');
    void audioTrack.stopProcessor?.().catch(stopError => {
      console.warn('[DebateNoiseFilter] Krisp cleanup failed after the audio context stopped.', stopError);
    });
  };
  const unsubscribe = () => context.removeEventListener('statechange', handleStateChange);
  context.addEventListener('statechange', handleStateChange);
  return unsubscribe;
}

async function stopProcessorQuietly(audioTrack: LocalTrackLike) {
  await audioTrack.stopProcessor?.().catch(stopError => {
    console.warn('[DebateNoiseFilter] Krisp cleanup failed after the connection changed.', stopError);
  });
}
