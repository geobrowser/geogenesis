import * as React from 'react';

// Finish comfortably inside the round title's held middle, before its 300ms exit starts.
const CUT_FADE_MS = 400;

/** Cover an automatic edit with the outgoing frames until both incoming recordings can paint. */
export function useVideoCutTransition({
  slot1VideoRef,
  slot2VideoRef,
  seek,
  holdForTransition,
  enabled,
  resetKey,
}: {
  slot1VideoRef: React.RefObject<HTMLVideoElement | null>;
  slot2VideoRef: React.RefObject<HTMLVideoElement | null>;
  seek: (seconds: number) => void;
  holdForTransition?: () => { release: () => void; cancel: () => void };
  enabled: boolean;
  resetKey: string;
}) {
  const slot1CanvasRef = React.useRef<HTMLCanvasElement>(null);
  const slot2CanvasRef = React.useRef<HTMLCanvasElement>(null);
  const clearRef = React.useRef<(() => void) | null>(null);

  React.useLayoutEffect(() => {
    // Scrubbing, replay, source replacement and leaving the card must discard a held frame.
    return () => clearRef.current?.();
  }, [resetKey, enabled]);

  const seekAcrossCut = React.useCallback(
    (seconds: number) => {
      clearRef.current?.();
      const videos = [slot1VideoRef.current, slot2VideoRef.current];
      const canvases = [slot1CanvasRef.current, slot2CanvasRef.current];
      if (!enabled || videos.some(video => !video) || canvases.some(canvas => !canvas)) {
        seek(seconds);
        return;
      }

      const pair = videos.map((video, index) => ({ video: video!, canvas: canvases[index]! }));
      let disposed = false;
      let releasing = false;
      let frame = 0;
      const animations: Animation[] = [];
      let hold: ReturnType<NonNullable<typeof holdForTransition>> | undefined;
      const canPaint = () => pair.every(({ video }) => !video.seeking && video.readyState >= 2);
      const clear = () => {
        if (disposed) return;
        disposed = true;
        hold?.cancel();
        cancelAnimationFrame(frame);
        for (const animation of animations) animation.cancel();
        for (const { video, canvas } of pair) {
          video.removeEventListener('seeked', ready);
          video.removeEventListener('loadeddata', ready);
          video.removeEventListener('error', clear);
          video.removeEventListener('emptied', clear);
          canvas.style.opacity = '0';
          canvas.width = canvas.height = 0;
        }
        if (clearRef.current === clear) clearRef.current = null;
      };
      const release = () => {
        if (disposed) return;
        // A decoder or sync correction can start seeking again during the presentation frames.
        // Keep both stills until readiness is reported again rather than uncovering one early.
        if (!canPaint()) {
          releasing = false;
          ready();
          return;
        }
        hold?.release();
        hold = undefined;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !pair[0].canvas.animate) {
          clear();
          return;
        }
        for (const { canvas } of pair) {
          animations.push(
            canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: CUT_FADE_MS,
              easing: 'ease-in-out',
              fill: 'forwards',
            })
          );
        }
        // Both surfaces use one start and finish, even when the decoders seek at different speeds.
        animations[0].onfinish = clear;
      };
      function ready() {
        if (disposed || releasing) return;
        cancelAnimationFrame(frame);
        // Decoders may recover with only `canplay`, or without another completion event.
        // Keep one cancellable check alive until both incoming frames are available.
        if (!canPaint()) {
          frame = requestAnimationFrame(ready);
          return;
        }
        releasing = true;
        // `seeked` can precede presentation of the new frame. Give both decoders a paint before
        // uncovering them; this also works when the viewer pauses during the edit.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(release);
        });
      }

      clearRef.current = clear;
      try {
        for (const { video, canvas } of pair) {
          if (!video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) {
            clear();
            seek(seconds);
            return;
          }
          const context = canvas.getContext('2d');
          if (!context) throw new Error('No frame capture context');
          const density = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.round(video.clientWidth * density);
          canvas.height = Math.round(video.clientHeight * density);
          // Match the video's object-cover crop so the still never changes the framing.
          const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
          canvas.style.opacity = '1';
          video.addEventListener('seeked', ready);
          video.addEventListener('loadeddata', ready);
          video.addEventListener('error', clear);
          video.addEventListener('emptied', clear);
        }
      } catch {
        // A decoder without a capturable frame should still make its normal cut.
        clear();
      }
      if (!disposed) hold = holdForTransition?.();
      seek(seconds);
      // The playback controller skips a seek when a paused element is already at its target.
      // In that case no `seeked` event follows, and the captured frames must still be released.
      ready();
    },
    [enabled, holdForTransition, seek, slot1VideoRef, slot2VideoRef]
  );

  return { slot1CanvasRef, slot2CanvasRef, seekAcrossCut };
}
