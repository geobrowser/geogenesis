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
 * Point a video element back at a source it is already supposed to be showing, from scratch, and
 * this time fetch it the way that works.
 *
 * `load()` alone does not do this once an element holds a `MediaError`: the spec's resource
 * selection runs against the src it already has, and Chrome answers a reload of a pipeline that
 * died mid-fetch from the same dead state. Detaching first is what makes the second `load()` a
 * genuinely new fetch.
 *
 * Detaching alone is not enough either, which is what the caller's whole recovery budget was
 * being spent discovering. `preload="metadata"` is what kills these recordings in the first
 * place: MediaRecorder WebM ships without a duration and without cues, so the demuxer has to seek
 * to work out how long the file is, and in metadata mode Chrome has already stopped fetching by
 * then — `PIPELINE_ERROR_READ: FFmpegDemuxer: demuxer seek failed`, on a URL that is perfectly
 * good. A rebuild that keeps `preload="metadata"` therefore reproduces the failure exactly, every
 * time; measured against the 89MB slot-1 recording of debate `01a0ca25`, three rebuilds failed
 * three times and a re-signed URL failed too, which is the tile that sat there saying so.
 *
 * Raising it to `auto` lets the data source serve that seek, and the same element loads to
 * `HAVE_ENOUGH_DATA` on the first attempt after the change. It is not a request to download the
 * recording: Chrome still buffers a couple of seconds and suspends — measured at ~4.7MB against
 * ~2MB for a metadata load of the same file — so the cost lands only on the recordings that
 * actually failed, and only once each. See the caller for how it is put back.
 *
 * Separate from React's own `src` attribute write, which cannot help here: the prop has not
 * changed, so React has nothing to reconcile and never touches the element.
 */
export function reattachVideoSource(video: HTMLVideoElement, src: string) {
  video.preload = 'auto';
  releaseVideo(video);
  video.setAttribute('src', src);
  video.load();
}
