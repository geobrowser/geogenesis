import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrefetchLink } from './prefetch-link';

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: unknown }>(
    function Link({ prefetch: _prefetch, ...props }, ref) {
      return <a ref={ref} {...props} />;
    }
  ),
}));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ hydrate: vi.fn() }) }));

afterEach(() => {
  cleanup();
  router.prefetch.mockReset();
});

describe('PrefetchLink', () => {
  it('prefetches on hover', () => {
    render(<PrefetchLink href="/space/a">link</PrefetchLink>);

    fireEvent.mouseEnter(screen.getByText('link'));

    expect(router.prefetch).toHaveBeenCalledWith('/space/a');
  });

  it('does not prefetch on hover when hoverPrefetch is off', () => {
    const onMouseEnter = vi.fn();
    render(
      <PrefetchLink href="/space/a" hoverPrefetch={false} onMouseEnter={onMouseEnter}>
        link
      </PrefetchLink>
    );

    fireEvent.mouseEnter(screen.getByText('link'));

    expect(router.prefetch).not.toHaveBeenCalled();
    expect(onMouseEnter).toHaveBeenCalled();
  });
});
