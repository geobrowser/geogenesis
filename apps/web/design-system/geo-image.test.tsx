import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { IPFS_GATEWAY_COUNT } from '~/core/utils/utils';

import { NativeGeoImage } from './geo-image';

afterEach(cleanup);

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
