import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoCutTransition } from './use-video-cut-transition';

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let reducedMotion = false;
const draw = vi.fn();
beforeEach(() => {
  frames.clear();
  nextFrame = 0;
  reducedMotion = false;
  draw.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tick() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach(callback => callback(0)));
}

function fixture(enabled = true) {
  const videos = [document.createElement('video'), document.createElement('video')];
  for (const video of videos) {
    for (const [key, value] of Object.entries({
      videoWidth: 640,
      videoHeight: 480,
      clientWidth: 480,
      clientHeight: 289,
      readyState: 2,
      seeking: false,
    })) {
      Object.defineProperty(video, key, { value, writable: true, configurable: true });
    }
  }
  const canvases = [document.createElement('canvas'), document.createElement('canvas')];
  const animations = canvases.map(() => ({ cancel: vi.fn(), onfinish: null as (() => void) | null }));
  canvases.forEach((canvas, index) => {
    canvas.animate = vi.fn(() => animations[index] as unknown as Animation);
  });
  const videoRefs = videos.map(current => ({ current }));
  const hold = { release: vi.fn(), cancel: vi.fn() };
  const holdForTransition = vi.fn(() => hold);
  const seek = vi.fn(() => videos.forEach(video => Object.defineProperty(video, 'seeking', { value: true })));
  const hook = renderHook(
    ({ resetKey }) =>
      useVideoCutTransition({
        slot1VideoRef: videoRefs[0],
        slot2VideoRef: videoRefs[1],
        seek,
        holdForTransition,
        enabled,
        resetKey,
      }),
    { initialProps: { resetKey: 'first' } }
  );
  hook.result.current.slot1CanvasRef.current = canvases[0];
  hook.result.current.slot2CanvasRef.current = canvases[1];
  const arrive = (index: number) =>
    act(() => {
      Object.defineProperty(videos[index], 'seeking', { value: false });
      videos[index].dispatchEvent(new Event('seeked'));
    });
  return {
    ...hook,
    videos,
    canvases,
    animations,
    seek,
    hold,
    holdForTransition,
    arrive,
    cut: () => act(() => hook.result.current.seekAcrossCut(72)),
  };
}

describe('automatic video cut transition', () => {
  it('captures both outgoing frames with the same cover crop before seeking', () => {
    const { cut, seek, videos, canvases } = fixture();
    cut();
    expect(draw).toHaveBeenCalledTimes(2);
    const density = Math.min(window.devicePixelRatio || 1, 2);
    expect(draw).toHaveBeenNthCalledWith(1, videos[0], 0, ((289 - 360) * density) / 2, 480 * density, 360 * density);
    expect(draw.mock.invocationCallOrder[1]).toBeLessThan(seek.mock.invocationCallOrder[0]);
    expect(canvases.map(canvas => canvas.style.opacity)).toEqual(['1', '1']);
  });

  it('holds both stills until both decoders arrive, then blends both together after presentation', () => {
    const { cut, arrive, canvases, animations } = fixture();
    cut();
    arrive(0);
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    arrive(1);
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    tick();
    for (const canvas of canvases) {
      expect(canvas.animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], {
        duration: 400,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
    }
    act(() => animations[0].onfinish?.());
    expect(canvases.map(canvas => canvas.style.opacity)).toEqual(['0', '0']);
    expect(canvases.map(canvas => canvas.width)).toEqual([0, 0]);
  });

  it('holds playback before the seek and releases it only when both incoming frames can paint', () => {
    const { cut, seek, arrive, hold, holdForTransition, rerender } = fixture();
    cut();
    expect(holdForTransition.mock.invocationCallOrder[0]).toBeLessThan(seek.mock.invocationCallOrder[0]);
    arrive(0);
    tick();
    tick();
    expect(hold.release).not.toHaveBeenCalled();
    arrive(1);
    tick();
    expect(hold.release).not.toHaveBeenCalled();
    tick();
    expect(hold.release).toHaveBeenCalledOnce();
    cut();
    rerender({ resetKey: 'inactive-or-new-source' });
    expect(hold.cancel).toHaveBeenCalledOnce();
    expect(hold.release).toHaveBeenCalledOnce();
  });

  it('waits for a current frame if seeked arrives while the decoder still has only metadata', () => {
    const { cut, arrive, videos, canvases } = fixture();
    cut();
    Object.defineProperty(videos[1], 'readyState', { value: 1 });
    arrive(0);
    arrive(1);
    tick();
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    Object.defineProperty(videos[1], 'readyState', { value: 2 });
    act(() => videos[1].dispatchEvent(new Event('loadeddata')));
    tick();
    tick();
    expect(canvases[0].animate).toHaveBeenCalledOnce();
  });

  it('releases captured frames when a seek is a no-op and emits no completion event', () => {
    const { cut, seek, canvases } = fixture();
    seek.mockImplementation(() => {});
    cut();
    tick();
    tick();
    expect(canvases[0].animate).toHaveBeenCalledOnce();
    expect(canvases[1].animate).toHaveBeenCalledOnce();
  });

  it('keeps both frames covered if another seek begins before the incoming frame can paint', () => {
    const { cut, arrive, videos, canvases } = fixture();
    cut();
    arrive(0);
    arrive(1);
    tick();
    Object.defineProperty(videos[1], 'seeking', { value: true });
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    expect(canvases.map(canvas => canvas.style.opacity)).toEqual(['1', '1']);
    arrive(1);
    tick();
    tick();
    expect(canvases[0].animate).toHaveBeenCalledOnce();
    expect(canvases[1].animate).toHaveBeenCalledOnce();
  });

  it.each(['canplay', 'no event'])('recovers after readiness is lost between presentation frames (%s)', event => {
    const { cut, arrive, videos, canvases } = fixture();
    cut();
    arrive(0);
    arrive(1);
    tick();
    Object.defineProperty(videos[1], 'readyState', { value: 1 });
    tick();
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    Object.defineProperty(videos[1], 'readyState', { value: 2 });
    if (event === 'canplay') act(() => videos[1].dispatchEvent(new Event('canplay')));
    tick();
    tick();
    tick();
    expect(canvases[0].animate).toHaveBeenCalledOnce();
    expect(canvases[1].animate).toHaveBeenCalledOnce();
  });

  it('polls an initial seek without completion events and cancels that poll on reset', () => {
    const { cut, videos, canvases, rerender } = fixture();
    cut();
    tick();
    expect(frames.size).toBe(1);
    videos.forEach(video => Object.defineProperty(video, 'seeking', { value: false }));
    tick();
    tick();
    tick();
    expect(canvases[0].animate).toHaveBeenCalledOnce();
    cut();
    tick();
    expect(frames.size).toBe(1);
    rerender({ resetKey: 'source-replaced' });
    expect(frames.size).toBe(0);
  });

  it('respects reduced motion while still protecting the seek from a blank frame', () => {
    reducedMotion = true;
    const { cut, arrive, canvases } = fixture();
    cut();
    expect(canvases[0].style.opacity).toBe('1');
    arrive(0);
    arrive(1);
    tick();
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    expect(canvases[0].style.opacity).toBe('0');
  });

  it('clears a pending presentation on manual seek or source replacement', () => {
    const { cut, arrive, rerender, canvases } = fixture();
    cut();
    arrive(0);
    arrive(1);
    expect(frames.size).toBe(1);
    rerender({ resetKey: 'manual-seek' });
    expect(frames.size).toBe(0);
    tick();
    tick();
    expect(canvases[0].animate).not.toHaveBeenCalled();
    expect(canvases[0].style.opacity).toBe('0');
  });

  it('cancels an interrupted blend and releases its resources on unmount', () => {
    const { cut, arrive, animations, canvases, unmount } = fixture();
    cut();
    arrive(0);
    arrive(1);
    tick();
    tick();
    cut();
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(canvases[0].style.opacity).toBe('1');
    unmount();
    expect(canvases[0].style.opacity).toBe('0');
    expect(canvases[0].width).toBe(0);
  });

  it('falls back to a normal cut when either frame cannot be captured', () => {
    const { cut, videos, canvases, seek, holdForTransition } = fixture();
    Object.defineProperty(videos[1], 'videoWidth', { value: 0 });
    cut();
    expect(seek).toHaveBeenCalledOnce();
    expect(holdForTransition).not.toHaveBeenCalled();
    expect(canvases.map(canvas => canvas.style.opacity)).toEqual(['0', '0']);
  });

  it('does not capture in fixed formats and clears held frames on a media error', () => {
    const fixed = fixture(false);
    fixed.cut();
    expect(draw).not.toHaveBeenCalled();
    expect(fixed.seek).toHaveBeenCalledOnce();
    fixed.unmount();
    const open = fixture();
    open.cut();
    act(() => open.videos[0].dispatchEvent(new Event('error')));
    expect(open.canvases.map(canvas => canvas.style.opacity)).toEqual(['0', '0']);
  });
});
