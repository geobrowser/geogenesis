import { render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStillFrameShown } from './still-frame-timing';

function Card({ onShown, stills }: { onShown: (at: number) => void; stills: string[] }) {
  const ref = React.useRef<HTMLElement | null>(null);
  useStillFrameShown(ref, onShown);
  return (
    <section ref={ref}>
      {stills.map(src => (
        <img key={src} src={src} data-debate-poster="" alt="" />
      ))}
    </section>
  );
}

function setLoaded(img: HTMLImageElement, loaded: boolean) {
  Object.defineProperty(img, 'complete', { configurable: true, value: loaded });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: loaded ? 640 : 0 });
}

describe('useStillFrameShown (GEO-3604)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports once both stills have loaded, at the later load', () => {
    const now = vi.spyOn(performance, 'now');
    const onShown = vi.fn();
    const { container } = render(<Card onShown={onShown} stills={['https://s/1.jpg', 'https://s/2.jpg']} />);
    const [first, second] = [...container.querySelectorAll('img')];

    now.mockReturnValue(1_000);
    setLoaded(first, true);
    first.dispatchEvent(new Event('load'));
    expect(onShown).not.toHaveBeenCalled();

    now.mockReturnValue(1_400);
    setLoaded(second, true);
    second.dispatchEvent(new Event('load'));
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onShown).toHaveBeenCalledWith(1_400);

    second.dispatchEvent(new Event('load'));
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('dates stills that loaded before hydration from their resource entry, not from now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3_000);
    vi.spyOn(performance, 'getEntriesByName').mockImplementation((name, type) => {
      if (type === 'paint') return [{ startTime: 900 }] as unknown as PerformanceEntryList;
      return [{ responseEnd: name.endsWith('1.jpg') ? 1_100 : 1_250 }] as unknown as PerformanceEntryList;
    });
    const loaded = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 640 });
    try {
      const onShown = vi.fn();
      render(<Card onShown={onShown} stills={['https://s/1.jpg', 'https://s/2.jpg']} />);
      expect(onShown).toHaveBeenCalledWith(1_250);
    } finally {
      if (loaded) Object.defineProperty(HTMLImageElement.prototype, 'complete', loaded);
      // jsdom's own naturalWidth is a prototype getter returning 0.
      Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 0 });
    }
  });

  it('does nothing without a callback', () => {
    const { container } = render(<Card onShown={undefined as never} stills={['https://s/1.jpg']} />);
    expect(() => container.querySelector('img')!.dispatchEvent(new Event('load'))).not.toThrow();
  });
});
