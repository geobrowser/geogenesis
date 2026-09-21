import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavbarBreadcrumb } from './navbar-breadcrumb';

const mocks = vi.hoisted(() => ({
  entity: null as { spaces: string[] } | null,
  otherSpaces: [] as Array<{ id: string; entity: { name: string; image: null } }>,
  spaceName: 'A space name long enough to require shrinking',
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({
    isLoading: false,
    space: { id: 'space-1', entity: { id: 'space-entity', name: mocks.spaceName, image: null } },
  }),
}));
vi.mock('~/core/database/entities', () => ({ useEntity: () => mocks.entity }));
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({ useSpacesByIds: () => ({ spaces: mocks.otherSpaces }) }));
vi.mock('~/core/utils/utils', () => ({
  NavUtils: {
    toSpace: (spaceId: string) => `/space/${spaceId}`,
    toEntity: (spaceId: string, entityId: string) => `/space/${spaceId}/${entityId}`,
  },
  hasName: (name: string | null | undefined) => Boolean(name),
}));
vi.mock('~/core/utils/space/space-ranking', () => ({ compareBySpaceRank: () => () => 0 }));
vi.mock('~/design-system/geo-image', () => ({ ThumbGeoImage: () => <img alt="" /> }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.entity = null;
  mocks.otherSpaces = [];
});

function expectSimpleBranchToShrink() {
  const label = screen.getByText(mocks.spaceName);
  const link = label.closest('a');

  expect(link).toHaveClass('min-w-0');
  expect(label.parentElement).toHaveClass('min-w-0', 'truncate');
  expect(link?.querySelector('.h-4.w-4')).toHaveClass('shrink-0');
  expect(link?.querySelector('.w-px')).toHaveClass('shrink-0');
}

describe('NavbarBreadcrumb shrink constraints', () => {
  it('carries the constraint through the space-only branch', () => {
    render(<NavbarBreadcrumb spaceId="space-1" />);

    expectSimpleBranchToShrink();
  });

  it('carries the constraint through the single-space entity branch', () => {
    mocks.entity = { spaces: ['space-1'] };
    render(<NavbarBreadcrumb spaceId="space-1" entityId="entity-1" />);

    expectSimpleBranchToShrink();
  });

  it('carries the constraint through the multi-space popover branch', () => {
    mocks.entity = { spaces: ['space-1', 'space-2'] };
    mocks.otherSpaces = [{ id: 'space-2', entity: { name: 'Another space', image: null } }];
    render(<NavbarBreadcrumb spaceId="space-1" entityId="entity-1" />);

    const trigger = screen.getByRole('button', { name: mocks.spaceName });
    const root = trigger.parentElement;
    const label = screen.getByText(mocks.spaceName);

    expect(root).toHaveClass('min-w-0', 'max-w-full');
    expect(trigger).toHaveClass('min-w-0');
    expect(label.parentElement).toHaveClass('min-w-0', 'truncate');
    expect(trigger.lastElementChild).toHaveClass('shrink-0');
  });
});
