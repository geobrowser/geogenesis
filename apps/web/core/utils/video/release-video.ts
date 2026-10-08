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
 * genuinely new fetch.
 *
 * Separate from React's own `src` attribute write, which cannot help here: the prop has not
 * changed, so React has nothing to reconcile and never touches the element.
 *
 * Re-fetches the source exactly as the element is currently configured — whatever `preload` it
 * carries is the `preload` the new fetch uses. A caller that wants a different one sets it first;
 * it cannot be done afterwards, because resource selection has already started by then.
 */
export function reattachVideoSource(video: HTMLVideoElement, src: string) {
  releaseVideo(video);
  video.setAttribute('src', src);
  video.load();
}
