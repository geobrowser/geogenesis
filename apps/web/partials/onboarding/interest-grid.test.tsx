import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';

import { InterestGrid, preloadInterestImages } from './interest-grid';

const { preload } = vi.hoisted(() => ({ preload: vi.fn() }));
vi.mock('react-dom', async importOriginal => ({ ...(await importOriginal<object>()), preload }));

const spaces: BrowseSpaceRow[] = [
  { id: 'crypto', name: 'Crypto', image: 'ipfs://bafyCover' },
  { id: 'world', name: 'World affairs', image: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InterestGrid', () => {
  it('toggles spaces by id and exposes selection without changing the choice contents', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<InterestGrid spaces={spaces} selectedIds={[]} onToggle={onToggle} />);
    const choice = screen.getByRole('button', { name: 'Crypto' });
    const contents = choice.textContent;
    expect(choice).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(choice);
    expect(onToggle).toHaveBeenCalledWith('crypto');

    rerender(<InterestGrid spaces={spaces} selectedIds={['crypto']} onToggle={onToggle} />);
    expect(choice).toHaveAttribute('aria-pressed', 'true');
    expect(choice.textContent).toBe(contents);
    expect(screen.getByRole('button', { name: 'World affairs' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('warms exactly the responsive cover requested by the visible eager image', () => {
    preloadInterestImages(spaces);
    const { container } = render(<InterestGrid spaces={spaces} selectedIds={[]} onToggle={vi.fn()} />);
    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('width', '72');
    // At 2x, 640px preserves over 144px vertically in the ~4:1 source covers.
    expect(image.getAttribute('srcset')).toMatch(/w=256.*1x.*w=640.*2x/);
    expect(preload).toHaveBeenCalledExactlyOnceWith(image.getAttribute('src'), {
      as: 'image',
      imageSrcSet: image.getAttribute('srcset'),
      fetchPriority: 'low',
    });
  });

  it('keeps a named choice usable if its image is missing or every gateway fails', () => {
    const { container } = render(<InterestGrid spaces={spaces} selectedIds={[]} onToggle={vi.fn()} />);
    const image = container.querySelector('img')!;
    for (let attempt = 0; attempt < 4; attempt += 1) fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Crypto' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'World affairs' })).toBeEnabled();
  });

  it('does not preload missing images or send external hosts through the optimizer', () => {
    preloadInterestImages([spaces[1], { id: 'external', name: 'External', image: 'https://example.com/cover.png' }]);
    expect(preload).not.toHaveBeenCalled();
  });
});
