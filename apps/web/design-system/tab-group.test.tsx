import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabGroup } from './tab-group';

const mocks = vi.hoisted(() => ({ pending: new Set<string>(), pathname: '/space/space-1/overview' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

/*
 * The real hook answers for the nearest Link above it.
 */
const LinkHrefContext = React.createContext<string | null>(null);

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLinkStatus: () => ({ pending: mocks.pending.has(React.use(LinkHrefContext) ?? '') }),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    href,
    className,
    ref,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className: string;
    ref?: React.Ref<HTMLAnchorElement>;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <LinkHrefContext.Provider value={href}>
      <a
        href={href}
        className={className}
        ref={ref}
        onClick={onClick}
        data-selected={className.split(' ').includes('text-text')}
      >
        {children}
      </a>
    </LinkHrefContext.Provider>
  ),
}));

vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ editable: false }) }));
vi.mock('~/core/state/editor/editor-provider', () => ({ useActiveTabIdForEditor: () => null }));
vi.mock('~/core/state/entity-side-panel-active-tab', () => ({ useEntitySidePanelActiveTab: () => null }));

const TABS = [
  { label: 'Overview', href: '/space/space-1/overview' },
  { label: 'Community', href: '/space/space-1/community' },
  { label: 'Activity', href: '/space/space-1/activity' },
];

beforeEach(() => {
  mocks.pending = new Set();
  mocks.pathname = '/space/space-1/overview';
});

/** The tabs reading as selected — the colour the row gives the committed or pending tab. */
function selectedLabels() {
  return [...document.querySelectorAll('a[data-selected="true"]')].map(a => (a.textContent ?? '').trim());
}

afterEach(cleanup);

/**
 * A tab reads as selected from `usePathname()`, which only updates when the navigation commits.
 */
/** Dispatches a click the way a browser would, so `defaultPrevented` is observable. */
function clickTab(label: string, init?: MouseEventInit) {
  const anchor = screen.getByRole('link', { name: label });
  const event = createEvent.click(anchor, init);
  fireEvent(anchor, event);
  return event;
}

describe('TabGroup pending state', () => {
  it('marks the tab being navigated to, before the route commits', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelectorAll('[data-tab-pending]')).toHaveLength(1);
  });

  it('draws no marker when nothing is pending', () => {
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelectorAll('[data-tab-pending]')).toHaveLength(0);
  });

  it('hands the selected state to the pending tab, not the committed one', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(selectedLabels()).toEqual(['Community']);
  });

  it('selects the committed tab while nothing is pending', () => {
    render(<TabGroup tabs={TABS} />);

    expect(selectedLabels()).toEqual(['Overview']);
  });

  // A navigation that fails or is interrupted reports `pending: false`, and the row has nothing to
  // unwind — it falls back to whatever the router committed.
  it('falls back to the committed tab when a pending navigation ends without one', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    const view = render(<TabGroup tabs={TABS} />);
    expect(selectedLabels()).toEqual(['Community']);

    mocks.pending = new Set();
    view.rerender(<TabGroup tabs={TABS} />);

    expect(selectedLabels()).toEqual(['Overview']);
  });

  /*
   * A second click while the first navigation is still out.
   *
   * The tabs report in tree order, so when the pending tab moves backwards along the row the tab
   * being *released* reports after the one being claimed.
   */
  it('keeps the newly pending tab when an earlier one releases after it', () => {
    mocks.pending = new Set(['/space/space-1/activity']);
    const view = render(<TabGroup tabs={TABS} />);
    expect(selectedLabels()).toEqual(['Activity']);

    mocks.pending = new Set(['/space/space-1/community']);
    view.rerender(<TabGroup tabs={TABS} />);

    expect(selectedLabels()).toEqual(['Community']);
  });

  // Purely visual: the marker cannot reach the Link to set `aria-busy`, so it must not be announced
  // as content either.
  it('hides the marker from assistive tech', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelector('[data-tab-pending]')).toHaveAttribute('aria-hidden');
  });
});

describe('TabGroup repeat-click guard', () => {
  it('swallows a second click on the tab already being fetched', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(clickTab('Community').defaultPrevented).toBe(true);
  });

  it('lets a different tab through while one is pending', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(clickTab('Activity').defaultPrevented).toBe(false);
  });

  // A modified or non-primary click is a new tab or window, not a repeat of the one in flight.
  it('lets a modified click through on the pending tab', () => {
    mocks.pending = new Set(['/space/space-1/community']);
    render(<TabGroup tabs={TABS} />);

    expect(clickTab('Community', { metaKey: true }).defaultPrevented).toBe(false);
    expect(clickTab('Community', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(clickTab('Community', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(clickTab('Community', { button: 1 }).defaultPrevented).toBe(false);
  });

  it('swallows a click on the tab already committed, while its content is still streaming', () => {
    mocks.pathname = '/space/space-1/community';
    render(<TabGroup tabs={TABS} />);

    expect(clickTab('Community').defaultPrevented).toBe(true);
  });

  it('leaves an ordinary click alone when nothing is pending', () => {
    render(<TabGroup tabs={TABS} />);

    expect(clickTab('Community').defaultPrevented).toBe(false);
  });
});
