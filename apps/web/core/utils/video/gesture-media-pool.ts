/**
 * Video elements that a tap has already unlocked for sound, shared across the debate feed (GEO-3594).
 *
 * iOS WebKit — Safari, and Chrome on iPhone, which runs the same engine — lets a media element make
 * sound only after a `play()` on that element inside a user gesture. It refuses any other unmute by
 * pausing the element. The grant belongs to the element, not the page, and it survives a change of
 * `src`. Each feed card used to create its own `<video>` elements, so the next card's elements had
 * never been tapped: a viewer who turned the sound on lost it on every scroll, and the card often
 * stopped on a Play button when the browser paused its speaker.
 *
 * This keeps the elements instead. A card takes one with `acquireGestureVideo` and hands it back
 * with `releaseGestureVideo`. On every tap anywhere on the page, each element that has not been
 * unlocked yet and is not playing gets a `play()` and an immediate `pause()`. That is enough for
 * WebKit to lift the restriction on it, and a few spare elements are unlocked at the same time. So
 * after the viewer's first tap, the cards they scroll to get elements the browser already accepts.
 *
 * Only on devices with this rule (`gestureUnlocksEachMediaElement`). Elsewhere the page's own user
 * activation is enough and cards keep plain `<video>` elements.
 */

/** Spare unlocked elements kept ready after a tap: enough for the next two cards and a third. */
const SPARE_ELEMENTS = 6;
/** The most idle elements kept. Any more are dropped for the garbage collector. */
const MAX_IDLE_ELEMENTS = 10;

const idle: HTMLVideoElement[] = [];
const inUse = new Set<HTMLVideoElement>();
const unlocked = new WeakSet<HTMLVideoElement>();
let listening = false;

/**
 * Whether this browser grants sound element by element, from a tap on each (iOS WebKit).
 *
 * iPhone and iPod in any browser, and iPad, which reports itself as a Mac but has touch points.
 */
export function gestureUnlocksEachMediaElement(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  return video;
}

/**
 * Whether the event being handled counts as a user gesture.
 *
 * A `touchend` that ends a scroll is not one, and a `play()` made from it would not unlock
 * anything. Marking the element unlocked anyway would leave it locked for good, so check the
 * page's activation where the browser reports it (Safari 16.4 and later).
 */
function inUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

function unlock(video: HTMLVideoElement) {
  // `play()` inside the gesture is what lifts the restriction, synchronously. The `pause()` straight
  // after puts the element back as it was; the play's promise then rejects with an AbortError.
  const started = video.play();
  video.pause();
  void started?.catch(() => {});
  unlocked.add(video);
}

/** Unlock every element still waiting for a tap, and top up the spares. */
export function unlockGestureVideos() {
  if (!inUserGesture()) return;
  for (const video of [...idle, ...inUse]) {
    // A playing element is the current card's, and its own controls handle it in the same tap
    // (`activateBothInGesture`). Pausing it here would interrupt what the viewer is watching.
    if (!unlocked.has(video) && video.paused) unlock(video);
  }
  while (idle.filter(video => unlocked.has(video)).length < SPARE_ELEMENTS) {
    const video = createVideo();
    unlock(video);
    idle.push(video);
  }
}

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  // Capture, so this runs before the tap's own handlers start anything. `touchend` is the gesture
  // iOS grants media for; `click` covers a tap that arrives without touch events.
  document.addEventListener('touchend', unlockGestureVideos, { capture: true, passive: true });
  document.addEventListener('click', unlockGestureVideos, { capture: true });
}

/** An element for a card to show a recording in. Unlocked already, if a tap has happened. */
export function acquireGestureVideo(): HTMLVideoElement {
  listen();
  // Prefer one a tap has unlocked.
  const index = idle.findIndex(video => unlocked.has(video));
  const video = index >= 0 ? idle.splice(index, 1)[0] : (idle.pop() ?? createVideo());
  inUse.add(video);
  return video;
}

/**
 * Give an element back. Its source is dropped, as `releaseVideo` does, so it holds no media while
 * it waits. The unlock stays with the element.
 */
export function releaseGestureVideo(video: HTMLVideoElement) {
  if (!inUse.delete(video)) return;
  video.pause();
  video.muted = true;
  video.removeAttribute('class');
  video.remove();
  if (idle.length >= MAX_IDLE_ELEMENTS) return;
  idle.push(video);
  // After the commit, because the card normally drops the source itself in the same commit
  // (`releaseVideo`), and a second `load()` would only repeat it. Not if a card took it back first.
  queueMicrotask(() => {
    if (inUse.has(video) || !video.hasAttribute('src')) return;
    video.removeAttribute('src');
    video.load();
  });
}

/** Whether a tap has unlocked this element. */
export function isGestureVideoUnlocked(video: HTMLVideoElement): boolean {
  return unlocked.has(video);
}

/** Tests only: forget every element and the listeners. */
export function resetGestureVideoPoolForTests() {
  idle.length = 0;
  inUse.clear();
  if (listening && typeof document !== 'undefined') {
    document.removeEventListener('touchend', unlockGestureVideos, { capture: true });
    document.removeEventListener('click', unlockGestureVideos, { capture: true });
  }
  listening = false;
}
