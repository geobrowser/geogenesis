import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type EditableTab, EditableTabGroup } from './editable-tab-group';

const mocks = vi.hoisted(() => ({
  activeTabId: 'tab-1' as string | null,
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/claim',
  useRouter: () => mocks.router,
}));

vi.mock('~/core/state/editor/editor-provider', () => ({
  useActiveTabIdForEditor: () => mocks.activeTabId,
}));

vi.mock('~/core/state/entity-side-panel-active-tab', () => ({
  useEntitySidePanelActiveTab: () => null,
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: { name: { set: vi.fn() } },
      relations: { set: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
      values: { deleteMany: vi.fn() },
    },
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: () => [],
  getValues: () => [],
}));

vi.mock('~/design-system/prefetch-link', async () => {
  const React = await import('react');

  return {
    PrefetchLink: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }
    >(function MockPrefetchLink({ children, href, prefetch, ...props }, ref) {
      return (
        <a {...props} ref={ref} href={typeof href === 'string' ? href : undefined} data-prefetch={prefetch}>
          {children}
        </a>
      );
    }),
  };
});

afterEach(cleanup);

describe('EditableTabGroup active indicator', () => {
  it('keeps one row-owned indicator outside the active sortable tab', async () => {
    const editableTabs: EditableTab[] = [
      {
        relation: {
          id: 'relation-1',
          entityId: 'relation-entity-1',
          spaceId: 'space-1',
          position: '1',
        } as EditableTab['relation'],
        entityId: 'tab-1',
        name: 'Authored tab',
        href: '/claim?tabId=tab-1',
      },
    ];

    render(<EditableTabGroup entityId="claim-1" spaceId="space-1" editableTabs={editableTabs} overviewHref="/claim" />);

    // dnd-kit's sortable attributes intentionally give this anchor the rendered role `button` so
    // keyboard users can pick it up. Assert both halves of that contract: its accessible role and
    // its real navigation target. Querying `link` would not match the DOM rendered in production.
    const activeLink = screen.getByRole('button', { name: 'Authored tab' });
    expect(activeLink).toHaveAttribute('href', '/claim?tabId=tab-1');

    await waitFor(() => expect(document.querySelectorAll('[data-active-tab-indicator]')).toHaveLength(1));

    const indicator = document.querySelector<HTMLElement>('[data-active-tab-indicator]');
    expect(activeLink).not.toContainElement(indicator);
    expect(indicator?.parentElement).toBe(activeLink.parentElement?.parentElement);
  });

  it('shows counters on fixed system tabs while editing', () => {
    render(
      <EditableTabGroup
        entityId="topic-1"
        spaceId="space-1"
        editableTabs={[]}
        systemTabsBefore={[
          { label: 'Overview', href: '/claim' },
          { label: 'Comments', href: '/claim/comments', badge: '7' },
        ]}
        overviewHref="/claim"
      />
    );

    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
