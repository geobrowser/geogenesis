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

/**
 * The browse bar has always drawn a rule where one group of tabs ends and another begins; the edit
 * bar drew none, so a row that split in two while reading merged back together the moment you
 * clicked Edit. A page may also put a system tab *after* the rule — a topic's Overview does — which
 * `divideBeforeAuthored` alone cannot express on either bar.
 */
describe('EditableTabGroup divider', () => {
  const dividerSelector = 'span[aria-hidden].w-px';

  it('draws no rule when no system tab asks for one', () => {
    render(
      <EditableTabGroup
        entityId="topic-1"
        spaceId="space-1"
        editableTabs={[]}
        systemTabsBefore={[{ label: 'Explore', href: '/topic' }]}
        overviewHref="/topic"
      />
    );

    expect(document.querySelectorAll(dividerSelector)).toHaveLength(0);
  });

  it('draws one before the system tab that asks for it', () => {
    render(
      <EditableTabGroup
        entityId="topic-1"
        spaceId="space-1"
        editableTabs={[]}
        systemTabsBefore={[
          { label: 'Explore', href: '/topic' },
          { label: 'Overview', href: '/topic?tabId=topic-1', dividerBefore: true },
        ]}
        overviewHref="/topic"
      />
    );

    const dividers = document.querySelectorAll(dividerSelector);
    expect(dividers).toHaveLength(1);
    // Before Overview, not before Explore — DOCUMENT_POSITION_FOLLOWING is 4.
    expect(dividers[0].compareDocumentPosition(screen.getByText('Overview')) & 4).toBe(4);
  });

  // Both rows go through one renderer. They used to be two copies of the same block, which is how
  // a trailing tab would have silently lost its rule — and `space-tabs` fills that row.
  it('draws one for a trailing system tab too', () => {
    render(
      <EditableTabGroup
        entityId="space-1"
        spaceId="space-1"
        editableTabs={[]}
        systemTabsBefore={[{ label: 'Overview', href: '/space' }]}
        systemTabsAfter={[{ label: 'Governance', href: '/space/governance', dividerBefore: true }]}
        overviewHref="/space"
      />
    );

    expect(document.querySelectorAll(dividerSelector)).toHaveLength(1);
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });
});
