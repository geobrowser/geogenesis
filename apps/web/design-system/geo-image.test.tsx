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
});
