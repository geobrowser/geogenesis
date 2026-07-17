type ExtractKeyframeOptions = {
  /** Seconds into the video to grab the frame. A small positive offset avoids a black opening frame. */
  seekTime?: number;
  mimeType?: string;
  /** 0–1 encoder quality for lossy `mimeType`s. */
  quality?: number;
  /** Give up and resolve `null` after this many ms so a broken/unseekable file never hangs the upload. */
  timeoutMs?: number;
};

/**
 * Where to seek before grabbing the frame. Clamp to the first half of the clip so short
 * videos still land on a real frame; when the duration isn't known yet (non-finite), seek
 * to `seekTime` directly rather than halving it.
 */
export function keyframeSeekTarget(seekTime: number, duration: number | null): number {
  return duration === null ? seekTime : Math.min(seekTime, duration / 2);
}

/** File extension for the encoded frame, derived from the output mime type (defaults to jpg). */
export function keyframeFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  return mimeType.startsWith('image/') ? mimeType.slice('image/'.length) : 'jpg';
}

/**
 * Grab a still keyframe from a video file, client-side, via a hidden <video> + canvas.
 *
 * Returns an image `File` (named `<video>-keyframe.<ext>`, JPEG by default) ready to
 * hand to the image upload helpers, or `null` if extraction isn't possible (no DOM, decode/seek
 * failure, timeout). Callers should treat `null` as "skip the keyframe" — a failed
 * extraction must never block saving the video itself.
 */
export async function extractVideoKeyframe(
  file: File,
  { seekTime = 0.1, mimeType = 'image/jpeg', quality = 0.9, timeoutMs = 15000 }: ExtractKeyframeOptions = {}
): Promise<File | null> {
  if (typeof document === 'undefined') return null;

  const objectUrl = URL.createObjectURL(file);

  try {
    const blob = await new Promise<Blob | null>(resolve => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
      };

      const finish = (result: Blob | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);

      video.addEventListener('error', () => finish(null));

      video.addEventListener('loadeddata', () => {
        const duration = Number.isFinite(video.duration) ? video.duration : null;
        const target = keyframeSeekTarget(seekTime, duration);
        try {
          video.currentTime = target;
        } catch {
          finish(null);
        }
      });

      video.addEventListener('seeked', () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          finish(null);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }

        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch {
          finish(null);
          return;
        }

        canvas.toBlob(finish, mimeType, quality);
      });

      video.src = objectUrl;
    });

    if (!blob) return null;

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'video';
    const ext = keyframeFileExtension(mimeType);
    return new File([blob], `${baseName}-keyframe.${ext}`, { type: blob.type || mimeType });
  } catch (error) {
    console.warn('[extract-keyframe] failed to extract video keyframe', error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
