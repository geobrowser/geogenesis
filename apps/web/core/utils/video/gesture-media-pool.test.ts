import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireGestureVideo,
  forgetGestureVideoUnlock,
  gestureUnlocksEachMediaElement,
  isGestureVideoUnlocked,
  markGestureVideoUnlocked,
  releaseGestureVideo,
  resetGestureVideoPoolForTests,
  unlockGestureVideos,
} from './gesture-media-pool';

describe('gesture media pool (GEO-3594)', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetGestureVideoPoolForTests();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  /** An element that has played, as the current card's has. */
  const played = (video: HTMLVideoElement) =>
    vi.spyOn(video, 'played', 'get').mockReturnValue({ length: 1 } as unknown as TimeRanges);

  afterEach(() => {
    resetGestureVideoPoolForTests();
    vi.restoreAllMocks();
  });

  it('applies to iPhone browsers, including Chrome on iPhone, and not to Android or desktop', () => {
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get');
    userAgent.mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
    );
    expect(gestureUnlocksEachMediaElement()).toBe(true);
    userAgent.mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
    );
    expect(gestureUnlocksEachMediaElement()).toBe(false);
  });

  it('applies to an iPad, which reports itself as a Mac with touch', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    );
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const setTouchPoints = (value: number) =>
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value });
    try {
      setTouchPoints(5);
      expect(gestureUnlocksEachMediaElement()).toBe(true);
      setTouchPoints(0);
      expect(gestureUnlocksEachMediaElement()).toBe(false);
    } finally {
      delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    }
  });

  it('unlocks a card’s element on a tap', () => {
    const video = acquireGestureVideo();
    expect(isGestureVideoUnlocked(video)).toBe(false);

    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(isGestureVideoUnlocked(video)).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });

  it('hands a released element to the next card, unlocked and without its source', async () => {
    const first = acquireGestureVideo();
    markGestureVideoUnlocked(first);
    first.setAttribute('src', 'https://cdn.test/a.webm');

    releaseGestureVideo(first);
    await Promise.resolve();

    expect(first.hasAttribute('src')).toBe(false);
    expect(first.muted).toBe(true);
    const next = acquireGestureVideo();
    expect(next).toBe(first);
    expect(isGestureVideoUnlocked(next)).toBe(true);
  });

  it('leaves the source alone when the next card takes the element back in the same commit', async () => {
    const first = acquireGestureVideo();
    first.setAttribute('src', 'https://cdn.test/a.webm');

    releaseGestureVideo(first);
    const next = acquireGestureVideo();
    next.setAttribute('src', 'https://cdn.test/b.webm');
    await Promise.resolve();

    expect(next).toBe(first);
    expect(next.getAttribute('src')).toBe('https://cdn.test/b.webm');
  });

  it('reloads a waiting card’s source after unlocking it, so it buffers as it did before', () => {
    const waiting = acquireGestureVideo();
    waiting.setAttribute('src', 'https://stream.test/a.m3u8');

    unlockGestureVideos();

    expect(isGestureVideoUnlocked(waiting)).toBe(true);
    expect(waiting.getAttribute('src')).toBe('https://stream.test/a.m3u8');
    // `reattachVideoSource`: dropped, then loaded again from scratch.
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not touch an element that has played, nor one fed through a MediaSource', () => {
    const paused = acquireGestureVideo();
    played(paused);
    const mse = acquireGestureVideo();
    mse.setAttribute('src', 'blob:https://geobrowser.io/1');

    unlockGestureVideos();

    expect(isGestureVideoUnlocked(paused)).toBe(false);
    expect(isGestureVideoUnlocked(mse)).toBe(false);
    expect(play.mock.contexts).not.toContain(paused);
    expect(play.mock.contexts).not.toContain(mse);
  });

  it('makes room for an unlocked element in a full pool by dropping a locked one', () => {
    const locked = Array.from({ length: 10 }, () => acquireGestureVideo());
    const unlockedVideo = acquireGestureVideo();
    locked.forEach(releaseGestureVideo);
    markGestureVideoUnlocked(unlockedVideo);

    releaseGestureVideo(unlockedVideo);

    expect(acquireGestureVideo()).toBe(unlockedVideo);
  });

  it('tops up spares only while the pool has room', () => {
    // Ten waiting elements a tap cannot unlock, because they have played.
    const waiting = Array.from({ length: 10 }, () => acquireGestureVideo());
    waiting.forEach(played);
    waiting.forEach(releaseGestureVideo);

    unlockGestureVideos();

    const handedOut = Array.from({ length: 11 }, () => acquireGestureVideo());
    expect(handedOut.filter(isGestureVideoUnlocked)).toEqual([]);
  });

  it('tries an element again after the browser refused it sound', () => {
    const video = acquireGestureVideo();
    unlockGestureVideos();
    forgetGestureVideoUnlock(video);
    expect(isGestureVideoUnlocked(video)).toBe(false);

    unlockGestureVideos();

    expect(isGestureVideoUnlocked(video)).toBe(true);
  });

  it('keeps unlocked spares ready after a tap for the cards not created yet', () => {
    acquireGestureVideo();
    unlockGestureVideos();

    const later = [acquireGestureVideo(), acquireGestureVideo(), acquireGestureVideo(), acquireGestureVideo()];
    expect(later.every(isGestureVideoUnlocked)).toBe(true);
  });

  it('leaves a playing element alone', () => {
    const playingVideo = acquireGestureVideo();
    vi.spyOn(playingVideo, 'paused', 'get').mockReturnValue(false);

    unlockGestureVideos();

    expect(isGestureVideoUnlocked(playingVideo)).toBe(false);
  });

  it('does nothing on a touch that is not a gesture, such as the end of a scroll', () => {
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
    try {
      const video = acquireGestureVideo();
      unlockGestureVideos();
      expect(isGestureVideoUnlocked(video)).toBe(false);
      expect(play).not.toHaveBeenCalled();
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation;
    }
  });
});
