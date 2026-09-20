import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Navbar } from './navbar';

vi.mock('~/design-system/client-only', () => ({
  ClientOnly: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('./navbar-client-actions', () => ({ NavbarClientActions: () => <div /> }));
vi.mock('./navbar-space-metadata', () => ({ NavbarSpaceMetadata: () => <div /> }));

describe('Navbar mobile browse control', () => {
  afterEach(cleanup);

  it('opens browse navigation from a full-height touch target', async () => {
    const onBrowseClick = vi.fn();
    const user = userEvent.setup();

    render(<Navbar onBrowseClick={onBrowseClick} onSearchClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Open browse menu' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveClass('h-11', 'w-11', 'mobile:flex');

    await user.click(button);
    expect(onBrowseClick).toHaveBeenCalledOnce();
  });

  it('removes the browse control during fullscreen experiences', () => {
    render(<Navbar onBrowseClick={vi.fn()} onSearchClick={vi.fn()} showBrowseButton={false} />);

    expect(screen.queryByRole('button', { name: 'Open browse menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('link')).not.toHaveClass('mobile:hidden');
  });
});
