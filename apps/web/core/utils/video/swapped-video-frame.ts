/**
 * Paints a playing clip with its two stacked halves exchanged, so the Agree speaker is on top
 * (GEO-3833). Ported from debates-react-native `platform/swappedVideoFrame.ts`.
 *
 * A canvas over the element rather than an SVG filter or a CSS transform on it: iOS can ignore SVG
 * filters on video, and a moment clip is one picture of both speakers, so no layout can move one
 * half. The canvas draws from the same element (no second decoder), on each new frame where the
 * browser reports frames, else on each animation frame, at most 640px wide. Drawing a cross-origin
 * clip only taints the canvas, which is fine: nothing reads its pixels.
 *
 * Returns a cleanup that stops painting and frees the backing stores.
 */
export function renderSwappedVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): () => void {
  const source = document.createElement('canvas');
  const input = source.getContext('2d', { alpha: false });
  const output = canvas.getContext('2d', { alpha: false });
  if (!input || !output) return () => {};
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  let videoFrame: number | undefined;
  let animationFrame: number | undefined;
  let disposed = false;
  const paint = () => {
    if (disposed || video.readyState < 2 || !video.videoWidth || !width || !height) return;
    const w = Math.min(video.videoWidth, 640);
    const h = Math.round((w * height) / width);
    if (source.width !== w || source.height !== h) {
      source.width = canvas.width = w;
      source.height = canvas.height = h;
    }
    // The element's own contain fit, letterboxing included, before the halves are exchanged.
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
    input.fillStyle = '#151515';
    input.fillRect(0, 0, w, h);
    input.drawImage(
      video,
      (w - video.videoWidth * scale) / 2,
      (h - video.videoHeight * scale) / 2,
      video.videoWidth * scale,
      video.videoHeight * scale
    );
    const half = h / 2;
    output.drawImage(source, 0, half, w, half, 0, 0, w, half);
    output.drawImage(source, 0, 0, w, half, 0, half, w, half);
  };
  const cancel = () => {
    if (videoFrame !== undefined) video.cancelVideoFrameCallback?.(videoFrame);
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    videoFrame = animationFrame = undefined;
  };
  const schedule = () => {
    if (disposed || video.paused || videoFrame !== undefined || animationFrame !== undefined) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      videoFrame = video.requestVideoFrameCallback(() => {
        videoFrame = undefined;
        paint();
        schedule();
      });
    } else {
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined;
        paint();
        schedule();
      });
    }
  };
  const update = () => {
    paint();
    schedule();
  };
  const pause = () => {
    cancel();
    paint();
  };
  const resize =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(([entry]) => {
          if (!entry) return;
          width = entry.contentRect.width;
          height = entry.contentRect.height;
          update();
        });
  resize?.observe(canvas);
  const events = ['loadeddata', 'seeked', 'resize', 'play'] as const;
  for (const event of events) video.addEventListener(event, update);
  video.addEventListener('pause', pause);
  update();
  return () => {
    disposed = true;
    cancel();
    resize?.disconnect();
    for (const event of events) video.removeEventListener(event, update);
    video.removeEventListener('pause', pause);
    // A card leaving the window gives its backing stores back.
    canvas.width = canvas.height = source.width = source.height = 0;
  };
}
