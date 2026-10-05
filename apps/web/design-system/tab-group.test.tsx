import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabGroup, tabGroupTabLinkStyles } from './tab-group';

const mocks = vi.hoisted(() => ({ pending: false, pathname: '/space/space-1/overview' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

// The hook answers for the nearest Link above it, which is what the marker relies on.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLinkStatus: () => ({ pending: mocks.pending }),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, className }: { children: React.ReactNode; href: string; className: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ editable: false }) }));
vi.mock('~/core/state/editor/editor-provider', () => ({ useActiveTabIdForEditor: () => null }));
vi.mock('~/core/state/entity-side-panel-active-tab', () => ({ useEntitySidePanelActiveTab: () => null }));

const TABS = [
  { label: 'Overview', href: '/space/space-1/overview' },
  { label: 'Community', href: '/space/space-1/community' },
];

beforeEach(() => {
  mocks.pending = false;
  mocks.pathname = '/space/space-1/overview';
});

afterEach(cleanup);

/**
 * A tab reads as selected from `usePathname()`, which only updates when the navigation commits.
 */
describe('TabGroup pending state', () => {
  it('marks the tab being navigated to, before the route commits', () => {
    mocks.pending = true;
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelectorAll('[data-tab-pending]').length).toBeGreaterThan(0);
  });

  it('draws no marker when nothing is pending', () => {
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelectorAll('[data-tab-pending]')).toHaveLength(0);
  });

  it('keeps the has-[] hook the marker needs to colour its own tab', () => {
    expect(tabGroupTabLinkStyles({ active: false })).toContain('has-[[data-tab-pending]]:text-text');
  });

  // Purely visual: the marker cannot reach the Link to set `aria-busy`, so it must not be announced
  // as content either.
  it('hides the marker from assistive tech', () => {
    mocks.pending = true;
    render(<TabGroup tabs={TABS} />);

    expect(document.querySelector('[data-tab-pending]')).toHaveAttribute('aria-hidden');
  });
});
