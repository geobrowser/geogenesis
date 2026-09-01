import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TabEntity } from '~/core/types';

const mocks = vi.hoisted(() => ({
  tabs: [] as TabEntity[],
  activeTabId: null as string | null,
}));

vi.mock('./use-entity-tab-entities', async () => {
  const actual = await vi.importActual<typeof import('./use-entity-tab-entities')>('./use-entity-tab-entities');
  return { ...actual, useEntityTabEntities: () => ({ tabRelations: [], tabs: mocks.tabs }) };
});

vi.mock('~/core/state/editor/editor-provider', () => ({
  useActiveTabIdForEditor: () => mocks.activeTabId,
}));

// The tab bar and the editor are both exercised elsewhere; here they only need to be identifiable.
vi.mock('~/design-system/tab-group', () => ({
  TabGroup: ({ tabs }: { tabs: Array<{ label: string; href: string }> }) => (
    <nav data-testid="tab-group">
      {tabs.map(tab => (
        <a key={tab.href} href={tab.href}>
          {tab.label}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock('~/partials/editor/editor', () => ({
  Editor: () => <div data-testid="tab-blocks">tab blocks</div>,
}));

const { CustomViewTabs } = await import('./custom-view-tabs');

const ENTITY = '07842862d2c3654c0324a07bc7cce1a4';
const SPACE = 'a379046c74a140178e1c0545c72767c5';

function view() {
  return render(
    <CustomViewTabs entityId={ENTITY} spaceId={SPACE} initialTabRelations={[]} tabEntities={[]}>
      <div data-testid="custom-view">custom view</div>
    </CustomViewTabs>
  );
}

const tabLabels = () => screen.getAllByRole('link').map(link => link.textContent);

beforeEach(() => {
  mocks.tabs = [];
  mocks.activeTabId = null;
});

afterEach(cleanup);

describe('CustomViewTabs', () => {
  // A lone "Overview" tab is chrome that does nothing, which is what the generic page already
  // decides for itself.
  it('renders the custom view alone when the entity has no other tabs', () => {
    view();

    expect(screen.getByTestId('custom-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-group')).not.toBeInTheDocument();
  });

  it('puts the custom view first, as Overview, and the entity tabs after it in order', () => {
    mocks.tabs = [
      { id: 'tab-sources', name: 'Sources' },
      { id: 'tab-timeline', name: 'Timeline' },
    ];
    view();

    expect(tabLabels()).toEqual(['Overview', 'Sources', 'Timeline']);
    // Overview is where the page lands, so it carries no tab parameter.
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', `/space/${SPACE}/${ENTITY}`);
    expect(screen.getByRole('link', { name: 'Sources' })).toHaveAttribute(
      'href',
      `/space/${SPACE}/${ENTITY}?tabId=tab-sources`
    );
  });

  it('shows the custom view on the Overview tab', () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    view();

    expect(screen.getByTestId('custom-view')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-blocks')).not.toBeInTheDocument();
  });

  it("shows the selected tab's blocks instead of the custom view", () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    mocks.activeTabId = 'tab-sources';
    view();

    expect(screen.getByTestId('tab-blocks')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-view')).not.toBeInTheDocument();
  });

  // There is only ever one Overview, and on these views it is always the custom view.
  describe('Overview collision', () => {
    it("drops the entity's own Overview tab", () => {
      mocks.tabs = [
        { id: 'tab-overview', name: 'Overview' },
        { id: 'tab-sources', name: 'Sources' },
      ];
      view();

      expect(tabLabels()).toEqual(['Overview', 'Sources']);
      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', `/space/${SPACE}/${ENTITY}`);
    });

    // Matched against a name somebody typed, not against an id.
    it('drops it however it was capitalised or spaced', () => {
      mocks.tabs = [
        { id: 'tab-a', name: '  overview ' },
        { id: 'tab-b', name: 'OVERVIEW' },
        { id: 'tab-c', name: 'Sources' },
      ];
      view();

      expect(tabLabels()).toEqual(['Overview', 'Sources']);
    });

    // A link to the suppressed tab resolves to the custom view, since a dropped tab is not in the
    // list the active tab is matched against.
    it('lands on the custom view when a link points at the suppressed tab', () => {
      mocks.tabs = [
        { id: 'tab-overview', name: 'Overview' },
        { id: 'tab-sources', name: 'Sources' },
      ];
      mocks.activeTabId = 'tab-overview';
      view();

      expect(screen.getByTestId('custom-view')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-blocks')).not.toBeInTheDocument();
    });

    // An entity whose only other tab is its own Overview has nothing to switch to.
    it('renders no bar when the only other tab was the suppressed one', () => {
      mocks.tabs = [{ id: 'tab-overview', name: 'Overview' }];
      view();

      expect(screen.queryByTestId('tab-group')).not.toBeInTheDocument();
      expect(screen.getByTestId('custom-view')).toBeInTheDocument();
    });
  });
});
