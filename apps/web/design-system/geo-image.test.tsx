import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { IPFS_GATEWAY_COUNT } from '~/core/utils/utils';

import { GeoImage, NativeGeoImage, ThumbGeoImage } from './geo-image';

// Only the component is replaced: `NativeGeoImage`'s `displayWidth` path needs the real `getImageProps`.
vi.mock('next/image', async importOriginal => ({
  ...(await importOriginal<typeof import('next/image')>()),
  default: ({
    src,
    alt,
    onError,
    onLoad,
    style,
    'aria-hidden': ariaHidden,
  }: {
    src: string;
    alt?: string;
    onError?: () => void;
    onLoad?: () => void;
    style?: React.CSSProperties;
    'aria-hidden'?: boolean | 'true' | 'false';
  }) => (
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt ?? ''}
      aria-hidden={ariaHidden}
      style={style}
      onError={onError}
      onLoad={onLoad}
    />
  ),
}));

afterEach(cleanup);

describe('GeoImage progressive placeholder', () => {
  const value = 'ipfs://bafyProgressive';

  it('keeps the blurred placeholder after a stage hop', () => {
    render(
      <div className="relative h-40 w-40">
        <GeoImage value={value} alt="cover" fill sizes="200px" lqip fallback={<span>fallback</span>} />
      </div>
    );

    expect(screen.getByAltText('').getAttribute('aria-hidden')).toBe('true');
    fireEvent.error(screen.getByAltText('cover'));

    // Mid-chain unoptimized stages must not tear down the LQIP and leave a blank box.
    expect(screen.getByAltText('').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByAltText('cover')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('keeps the blurred placeholder when every gateway fails', () => {
    render(
      <div className="relative h-40 w-40">
        <GeoImage value={value} alt="cover" fill sizes="200px" lqip fallback={<span>fallback</span>} />
      </div>
    );

    // Optimized + unoptimized on Filebase, then Pinata, then Lighthouse.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      fireEvent.error(screen.getByAltText('cover'));
    }

    expect(screen.getByAltText('').getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByAltText('cover')).toBeNull();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});

// A hidden image stays hidden in the server HTML until hydration, which delays LCP.
describe('GeoImage fade', () => {
  const value = 'ipfs://bafyFade';

  it('fades the full image in over a placeholder once it loads', () => {
    render(<GeoImage value={value} alt="cover" fill sizes="200px" lqip />);
    const image = screen.getByAltText('cover');

    expect(image).toHaveStyle({ opacity: '0' });
    fireEvent.load(image);
    expect(image).toHaveStyle({ opacity: '1' });
  });

  it('requests no placeholder and renders visible unless asked', () => {
    render(<GeoImage value={value} alt="cover" fill />);

    expect(screen.queryByAltText('')).toBeNull();
    expect(screen.getByAltText('cover').style.opacity).toBe('');
  });

  it('renders a thumbnail visible', () => {
    render(<ThumbGeoImage value={value} alt="thumb" />);

    expect(screen.getByAltText('thumb').style.opacity).toBe('');
  });

  it('requests no placeholder for a priority image, which would be a second preload', () => {
    render(<GeoImage value={value} alt="cover" fill sizes="200px" lqip priority />);

    expect(screen.queryByAltText('')).toBeNull();
    expect(screen.getByAltText('cover').style.opacity).toBe('');
  });
});

/**
 * GEO-2642. An avatar whose image cannot load used to leave the browser's broken-image icon on
 * screen: a bad CID still resolves to a perfectly valid gateway URL, so the `<img>` renders, 404s
 * at every gateway in turn, and there was nothing to fall back to.
 */
describe('NativeGeoImage', () => {
  const exhaustGateways = (image: HTMLElement) => {
    for (let attempt = 0; attempt < IPFS_GATEWAY_COUNT; attempt += 1) {
      fireEvent.error(image);
    }
  };

  it('walks the gateway chain before giving up', () => {
    render(<NativeGeoImage value="ipfs://bafyBroken" alt="avatar" fallback={<span>fallback</span>} />);

    const image = screen.getByAltText('avatar');
    const first = image.getAttribute('src');
    fireEvent.error(image);

    expect(screen.getByAltText('avatar').getAttribute('src')).not.toBe(first);
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('shows the fallback once every gateway has failed', () => {
    render(<NativeGeoImage value="ipfs://bafyBroken" alt="avatar" fallback={<span>fallback</span>} />);

    exhaustGateways(screen.getByAltText('avatar'));

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('avatar')).toBeNull();
  });

  // A non-IPFS URL has nowhere else to look, so retrying the same src would loop forever.
  it('gives up immediately on a non-ipfs value', () => {
    render(<NativeGeoImage value="https://example.com/missing.png" alt="avatar" fallback={<span>fallback</span>} />);

    fireEvent.error(screen.getByAltText('avatar'));

    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  // A bare CID resolves to nothing a browser can fetch, so it never gets as far as an error.
  it('shows the fallback for a value that cannot be rendered at all', () => {
    render(<NativeGeoImage value="bafyBareCidWithNoScheme" alt="avatar" fallback={<span>fallback</span>} />);

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('avatar')).toBeNull();
  });

  // These render in recycled lists — a call's participant strip reorders constantly — so a
  // previous participant's exhausted state must not follow the component to the next one.
  it('starts over when the value changes', () => {
    const { rerender } = render(
      <NativeGeoImage value="ipfs://bafyBroken" alt="avatar" fallback={<span>fallback</span>} />
    );
    exhaustGateways(screen.getByAltText('avatar'));
    expect(screen.getByText('fallback')).toBeInTheDocument();

    rerender(<NativeGeoImage value="ipfs://bafyWorking" alt="avatar" fallback={<span>fallback</span>} />);

    expect(screen.getByAltText('avatar')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('renders nothing rather than crashing when no fallback is given', () => {
    const { container } = render(<NativeGeoImage value="bafyBareCidWithNoScheme" alt="avatar" />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('displayWidth', () => {
    const filebase = 'https://mature-tomato-basilisk.myfilebase.com/ipfs/bafyAvatar';

    it('asks the optimizer first, with widths the optimizer accepts', () => {
      render(<NativeGeoImage value="ipfs://bafyAvatar" alt="avatar" displayWidth={20} />);

      const image = screen.getByAltText('avatar');
      expect(image.getAttribute('src')).toMatch(/^\/_next\/image\?url=/);
      expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain(filebase);
      // 20px at 1x and 2x snap to the configured imageSizes (32 and 48 by default).
      expect(image.getAttribute('srcSet')).toMatch(/w=32.*1x.*w=48.*2x/);
    });

    it('falls back to the raw url, then the next gateway, then the fallback', () => {
      render(
        <NativeGeoImage value="ipfs://bafyAvatar" alt="avatar" displayWidth={20} fallback={<span>fallback</span>} />
      );

      fireEvent.error(screen.getByAltText('avatar'));
      expect(screen.getByAltText('avatar').getAttribute('src')).toBe(filebase);
      expect(screen.getByAltText('avatar').getAttribute('srcset')).toBeNull();

      fireEvent.error(screen.getByAltText('avatar'));
      expect(screen.getByAltText('avatar').getAttribute('src')).not.toBe(filebase);

      for (let i = 0; i < IPFS_GATEWAY_COUNT; i += 1) fireEvent.error(screen.queryByAltText('avatar') ?? document.body);
      expect(screen.getByText('fallback')).toBeInTheDocument();
    });

    it('never sends a host we do not control to the optimizer (GEO-2984)', () => {
      render(<NativeGeoImage value="https://example.com/a.png" alt="avatar" displayWidth={20} />);

      expect(screen.getByAltText('avatar').getAttribute('src')).toBe('https://example.com/a.png');
    });

    it('leaves the src alone when no displayWidth is given', () => {
      render(<NativeGeoImage value="ipfs://bafyAvatar" alt="avatar" />);

      expect(screen.getByAltText('avatar').getAttribute('src')).toBe(filebase);
    });
  });
});
