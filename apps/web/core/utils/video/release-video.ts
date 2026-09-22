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

/**
 * Point a video element back at a source it is already supposed to be showing, from scratch.
 *
 * `load()` alone does not do this once an element holds a `MediaError`: the spec's resource
 * selection runs against the src it already has, and Chrome answers a reload of a pipeline that
 * died mid-fetch from the same dead state. Detaching first is what makes the second `load()` a
 * genuinely new fetch — measured against a debate recording whose demuxer had failed, where this
 * sequence took the element from `error.code === 2` back to `HAVE_ENOUGH_DATA`.
 *
 * Separate from React's own `src` attribute write, which cannot help here: the prop has not
 * changed, so React has nothing to reconcile and never touches the element.
 */
export function reattachVideoSource(video: HTMLVideoElement, src: string) {
  releaseVideo(video);
  video.setAttribute('src', src);
  video.load();
}
