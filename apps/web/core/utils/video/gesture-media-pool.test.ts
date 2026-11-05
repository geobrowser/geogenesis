import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireGestureVideo,
  gestureUnlocksEachMediaElement,
  isGestureVideoUnlocked,
  releaseGestureVideo,
  resetGestureVideoPoolForTests,
  unlockGestureVideos,
} from './gesture-media-pool';

describe('gesture media pool (GEO-3594)', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetGestureVideoPoolForTests();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

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

  it('unlocks a card’s element on a tap, and hands it to the next card once it is given back', async () => {
    const first = acquireGestureVideo();
    expect(isGestureVideoUnlocked(first)).toBe(false);

    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(isGestureVideoUnlocked(first)).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();

    first.setAttribute('src', 'https://cdn.test/a.webm');
    releaseGestureVideo(first);
    await Promise.resolve();
    expect(first.hasAttribute('src')).toBe(false);
    expect(first.muted).toBe(true);
    // The next card gets an unlocked element, without another tap.
    expect(isGestureVideoUnlocked(acquireGestureVideo())).toBe(true);
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
