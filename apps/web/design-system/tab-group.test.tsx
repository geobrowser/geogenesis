import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/space/space-1/entity-1',
  activeTabId: null as string | null,
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ editable: false }) }));
vi.mock('~/core/state/editor/editor-provider', () => ({ useActiveTabIdForEditor: () => mocks.activeTabId }));
vi.mock('~/core/state/entity-side-panel-active-tab', () => ({ useEntitySidePanelActiveTab: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props}>{children}</a>
  ),
}));

const { TabGroup } = await import('./tab-group');

const OVERVIEW = '/space/space-1/entity-1';
const SOURCES = '/space/space-1/entity-1?tabId=tab-sources';

/**
 * Unselected tabs are grey. Matched on that rather than on the selected colour, because the
 * unselected class is `text-grey-04 hover:text-text` — it contains the selected colour too, so
 * looking for `text-text` would match every tab.
 */
const isSelected = (name: string) => !screen.getByRole('link', { name }).className.includes('text-grey-04');

function renderGroup(overviewActive?: boolean) {
  render(
    <TabGroup
      tabs={[
        { label: 'Overview', href: OVERVIEW, active: overviewActive },
        { label: 'Sources', href: SOURCES },
      ]}
    />
  );
}

beforeEach(() => {
  mocks.activeTabId = null;
});

afterEach(cleanup);

describe('TabGroup selection', () => {
  it('selects the tab whose href matches the active one', () => {
    renderGroup();

    expect(isSelected('Overview')).toBe(true);
    expect(isSelected('Sources')).toBe(false);
  });

  it('follows the active tab as it changes', () => {
    mocks.activeTabId = 'tab-sources';
    renderGroup();

    expect(isSelected('Sources')).toBe(true);
    expect(isSelected('Overview')).toBe(false);
  });

  /**
   * The href comparison assumes the active tab is in the list. A surface that hides a tab while
   * still answering for it — the custom claim and topic views, which drop the entity's own
   * "Overview" — has to say which tab is selected, or nothing in the bar is.
   */
  it('leaves every tab unselected when the active one is not in the list', () => {
    mocks.activeTabId = 'tab-not-listed';
    renderGroup();

    expect(isSelected('Overview')).toBe(false);
    expect(isSelected('Sources')).toBe(false);
  });

  it('honours a caller that says which tab is selected', () => {
    mocks.activeTabId = 'tab-not-listed';
    renderGroup(true);

    expect(isSelected('Overview')).toBe(true);
    expect(isSelected('Sources')).toBe(false);
  });

  // The override is only an override: `false` still means not selected, even when the href matches.
  it('lets a caller unselect a tab the comparison would have chosen', () => {
    render(
      <TabGroup
        tabs={[
          { label: 'Overview', href: OVERVIEW, active: false },
          { label: 'Sources', href: SOURCES },
        ]}
      />
    );

    expect(isSelected('Overview')).toBe(false);
  });
});
