import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { blockMediaFrame } from '~/core/hooks/use-block-media-dimensions';

import { DataBlockLoadingPlaceholder } from './data-block-loading-placeholder';

afterEach(cleanup);

/**
 * `TableBlockGalleryItem` sizes its media frame with exactly this call, so deriving the
 * placeholder's frame the same way is what keeps the swap from placeholder to cards free of a
 * reflow. If that pairing ever drifts, these expectations are the thing that should fail.
 */
const galleryFrame = (dimensions: { width: number | null; height: number | null }) =>
  blockMediaFrame({
    ...dimensions,
    aspectRatio:
      dimensions.width != null && dimensions.height != null ? `${dimensions.width} / ${dimensions.height}` : null,
  });

const frames = (container: HTMLElement) => Array.from(container.querySelectorAll('.bg-grey-02.rounded-lg'));

describe('DataBlockLoadingPlaceholder', () => {
  it('renders a gallery grid for a gallery block rather than a table', () => {
    const { container } = render(<DataBlockLoadingPlaceholder view="GALLERY" items={3} />);

    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.grid-cols-3')).not.toBeNull();
    expect(frames(container)).toHaveLength(3);
  });

  it('reserves one card per row the block is about to render', () => {
    const { container } = render(<DataBlockLoadingPlaceholder view="GALLERY" items={9} />);

    expect(frames(container)).toHaveLength(9);
  });

  it('keeps the default 2:1 frame when the block configures no dimensions', () => {
    const { container } = render(
      <DataBlockLoadingPlaceholder view="GALLERY" items={1} mediaFrame={galleryFrame({ width: null, height: null })} />
    );

    const [frame] = frames(container);
    expect(frame).toHaveClass('aspect-2/1');
    expect(frame.getAttribute('style')).toBeNull();
  });

  it('adopts the configured aspect ratio so the cards land in the same box', () => {
    const { container } = render(
      <DataBlockLoadingPlaceholder view="GALLERY" items={1} mediaFrame={galleryFrame({ width: 1080, height: 1920 })} />
    );

    const [frame] = frames(container);
    expect(frame).toHaveStyle({ aspectRatio: '1080 / 1920' });
    expect(frame).not.toHaveClass('aspect-2/1');
  });

  it('adopts a configured fixed height', () => {
    const { container } = render(
      <DataBlockLoadingPlaceholder view="GALLERY" items={1} mediaFrame={galleryFrame({ width: null, height: 320 })} />
    );

    const [frame] = frames(container);
    expect(frame).toHaveStyle({ height: '320px' });
    expect(frame).not.toHaveClass('aspect-2/1');
  });

  it('renders a list placeholder for a list block', () => {
    const { container } = render(<DataBlockLoadingPlaceholder view="LIST" items={2} />);

    expect(container.querySelector('table')).toBeNull();
    // The 64px avatar `TableBlockListItem` renders.
    expect(container.querySelectorAll('.h-16.w-16')).toHaveLength(2);
  });

  it('renders a bulleted placeholder for a bulleted list block', () => {
    const { container } = render(<DataBlockLoadingPlaceholder view="BULLETED_LIST" items={4} />);

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getAllByText('•')).toHaveLength(4);
  });

  it.each(['TABLE', 'EXPLORE', 'PILL'] as const)('falls back to the table placeholder for %s', view => {
    const { container } = render(<DataBlockLoadingPlaceholder view={view} items={3} />);

    expect(container.querySelector('table')).not.toBeNull();
  });
});
