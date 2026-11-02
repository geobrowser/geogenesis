import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';

import React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type EditableTab, EditableTabGroup } from './editable-tab-group';

const mocks = vi.hoisted(() => ({
  activeTabId: 'tab-1' as string | null,
  pending: new Set<string>(),
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

/*
 * The real hook answers for the nearest Link above it. The mocked link records its own href on this context.
 */
const LinkHrefContext = React.createContext<string | null>(null);

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  useLinkStatus: () => ({ pending: mocks.pending.has(React.use(LinkHrefContext) ?? '') }),
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
      const resolved = typeof href === 'string' ? href : undefined;

      return (
        <LinkHrefContext.Provider value={resolved ?? null}>
          <a
            {...props}
            ref={ref}
            href={resolved}
            data-prefetch={prefetch}
            data-selected={(props.className ?? '').split(' ').includes('text-text')}
          >
            {children}
          </a>
        </LinkHrefContext.Provider>
      );
    }),
  };
});

afterEach(() => {
  cleanup();
  mocks.router.replace.mockClear();
  mocks.pending = new Set();
  mocks.activeTabId = 'tab-1';
});

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

describe('EditableTabGroup deleting the open tab', () => {
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
      href: '/space/space-1?tabId=tab-1',
    },
  ];

  async function deleteOpenTab(props: { closedTabHref?: string }) {
    render(
      <EditableTabGroup
        entityId="space-entity"
        spaceId="space-1"
        editableTabs={editableTabs}
        overviewHref="/space/space-1"
        {...props}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tab actions' }));
    fireEvent.click(await screen.findByText('Delete tab'));
  }

  it('lands on the page content, which a topic space keeps apart from its bare URL', async () => {
    await deleteOpenTab({ closedTabHref: '/space/space-1/overview' });

    expect(mocks.router.replace).toHaveBeenCalledWith('/space/space-1/overview', { scroll: false });
  });

  it('falls back to the bare URL everywhere else', async () => {
    await deleteOpenTab({});

    expect(mocks.router.replace).toHaveBeenCalledWith('/space/space-1', { scroll: false });
  });
});

/**
 * Edit mode draws its own tab row, so none of the browse row's work reached an owner: no dots, no
 * colour change, the underline left on the old tab, and no guard against clicking again.
 */
describe('EditableTabGroup pending state', () => {
  const AUTHORED: EditableTab[] = [
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

  function renderRow() {
    return render(
      <EditableTabGroup
        entityId="claim-1"
        spaceId="space-1"
        editableTabs={AUTHORED}
        systemTabsBefore={[
          { label: 'Overview', href: '/claim' },
          { label: 'Activity', href: '/claim/activity' },
        ]}
        overviewHref="/claim"
      />
    );
  }

  it('marks a system tab being navigated to', () => {
    mocks.pending = new Set(['/claim/activity']);
    renderRow();

    const marked = document.querySelectorAll('[data-tab-pending]');
    expect(marked).toHaveLength(1);
    expect(marked[0].closest('a')).toHaveAttribute('href', '/claim/activity');
  });

  it('hands the selected state to the pending system tab, not the committed one', () => {
    mocks.pending = new Set(['/claim/activity']);
    renderRow();

    const selected = [...document.querySelectorAll('a[data-selected="true"]')].map(a => a.getAttribute('href'));
    expect(selected).toEqual(['/claim/activity']);
  });

  // The authored tabs are the draggable ones, where the indicator ref is composed with the
  // sortable's own node rather than owned outright.
  it('marks an authored tab being navigated to', () => {
    mocks.pending = new Set(['/claim?tabId=tab-1']);
    renderRow();

    expect(document.querySelectorAll('[data-tab-pending]')).toHaveLength(1);
  });

  it('draws no marker when nothing is pending', () => {
    renderRow();

    expect(document.querySelectorAll('[data-tab-pending]')).toHaveLength(0);
  });

  it('swallows a click on the system tab already selected', () => {
    // With no authored tab selected, `fullPath` is `/claim` and Overview is the committed tab.
    mocks.activeTabId = null;
    renderRow();

    const overview = screen.getByRole('link', { name: 'Overview' });
    const event = createEvent.click(overview);
    fireEvent(overview, event);

    expect(event.defaultPrevented).toBe(true);
  });

  /*
   * The authored tabs reach the same guard through `handleLinkClick`, which already had two earlier
   * exits — a just-finished drag, and the side panel's in-place selection — so the guard has to sit
   * after both rather than in front of them.
   */
  it('swallows a click on the authored tab already selected', () => {
    renderRow();

    const authored = screen.getByRole('button', { name: 'Authored tab' });
    const event = createEvent.click(authored);
    fireEvent(authored, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('lets a different tab through', () => {
    renderRow();

    const activity = screen.getByRole('link', { name: 'Activity' });
    const event = createEvent.click(activity);
    fireEvent(activity, event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('lets a modified click through on the selected tab', () => {
    mocks.activeTabId = null;
    renderRow();

    const overview = screen.getByRole('link', { name: 'Overview' });
    const event = createEvent.click(overview, { metaKey: true });
    fireEvent(overview, event);

    expect(event.defaultPrevented).toBe(false);
  });
});
