import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditableBountySpace } from '~/core/bounties/use-editable-bounty-spaces';

import { NewBountyButton } from './new-bounty-button';

const mocks = vi.hoisted(() => ({
  spaces: [] as EditableBountySpace[],
}));

vi.mock('~/core/bounties/use-editable-bounty-spaces', () => ({
  useEditableBountySpaces: () => ({ data: mocks.spaces }),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The Radix popover is not what's under test; render trigger and items inline.
vi.mock('~/design-system/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {trigger}
      <div data-testid="menu-items">{children}</div>
    </div>
  ),
  MenuItem: ({ href, children }: { href?: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  mocks.spaces = [];
});
afterEach(cleanup);

describe('NewBountyButton', () => {
  it('renders nothing when the viewer edits no participating space', () => {
    const { container } = render(<NewBountyButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links straight to the create form when there is exactly one editable space', () => {
    mocks.spaces = [{ id: 'space-a', name: 'Space A' }];
    render(<NewBountyButton />);
    expect(screen.getByTestId('new-bounty-button')).toHaveAttribute('href', '/space/space-a/bounties/new');
  });

  it('offers a space picker when there are several editable spaces', () => {
    mocks.spaces = [
      { id: 'space-a', name: 'Space A' },
      { id: 'space-b', name: 'Space B' },
    ];
    render(<NewBountyButton />);
    expect(screen.getByRole('button', { name: 'New bounty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Space A' })).toHaveAttribute('href', '/space/space-a/bounties/new');
    expect(screen.getByRole('link', { name: 'Space B' })).toHaveAttribute('href', '/space/space-b/bounties/new');
  });
});
