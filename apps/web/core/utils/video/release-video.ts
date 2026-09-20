/**
 * Return a video element to its empty resource state.
 *
 * Pausing alone can leave decoded frames and buffered media resident, especially on mobile.
 * Removing the source and reloading tells the browser it can release those resources.
 */
export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}
