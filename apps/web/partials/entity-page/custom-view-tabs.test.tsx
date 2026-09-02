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

// The tab bar and the editor are exercised elsewhere; here they only need to be identifiable.
vi.mock('~/design-system/tab-group', () => ({
  TabGroup: ({ tabs }: { tabs: Array<{ label: string; href: string; active?: boolean }> }) => (
    <nav data-testid="tab-group">
      {tabs.map(tab => (
        <a key={tab.href} href={tab.href} data-active={tab.active === undefined ? 'derived' : String(tab.active)}>
          {tab.label}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock('~/partials/editor/editor', () => ({
  Editor: () => <div data-testid="tab-blocks">tab blocks</div>,
}));

const { useCustomViewTabs } = await import('./custom-view-tabs');

const ENTITY = '07842862d2c3654c0324a07bc7cce1a4';
const SPACE = 'a379046c74a140178e1c0545c72767c5';

/** Renders the slot the way a custom view does: the bar at its seam, the body under it. */
function Harness() {
  const { bar, body } = useCustomViewTabs({
    entityId: ENTITY,
    spaceId: SPACE,
    initialTabRelations: [],
    tabEntities: [],
  });
  return (
    <div>
      <div data-testid="shared-chrome">shared</div>
      {bar}
      {body ?? <div data-testid="overview-content">overview</div>}
    </div>
  );
}

const tabLabels = () => screen.getAllByRole('link').map(link => link.textContent);

beforeEach(() => {
  mocks.tabs = [];
  mocks.activeTabId = null;
});

afterEach(cleanup);

describe('useCustomViewTabs', () => {
  // A lone "Overview" is chrome that does nothing, which is what the generic page already decides.
  it('offers no bar when the entity has no other tabs', () => {
    render(<Harness />);

    expect(screen.queryByTestId('tab-group')).not.toBeInTheDocument();
    expect(screen.getByTestId('overview-content')).toBeInTheDocument();
  });

  it('puts the custom view first, as Overview, and the entity tabs after it in order', () => {
    mocks.tabs = [
      { id: 'tab-sources', name: 'Sources' },
      { id: 'tab-timeline', name: 'Timeline' },
    ];
    render(<Harness />);

    expect(tabLabels()).toEqual(['Overview', 'Sources', 'Timeline']);
    // Overview is where the page lands, so it carries no tab parameter.
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', `/space/${SPACE}/${ENTITY}`);
    expect(screen.getByRole('link', { name: 'Sources' })).toHaveAttribute(
      'href',
      `/space/${SPACE}/${ENTITY}?tabId=tab-sources`
    );
  });

  it('leaves the view its own content on the Overview tab', () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    render(<Harness />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-blocks')).not.toBeInTheDocument();
  });

  // With a real tab open, the href comparison is right and is left to decide.
  it('leaves the selected tab to be matched by href', () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    mocks.activeTabId = 'tab-sources';
    render(<Harness />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('link', { name: 'Sources' })).toHaveAttribute('data-active', 'derived');
  });

  it("hands back the selected tab's blocks in place of the view's own content", () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    mocks.activeTabId = 'tab-sources';
    render(<Harness />);

    expect(screen.getByTestId('tab-blocks')).toBeInTheDocument();
    expect(screen.queryByTestId('overview-content')).not.toBeInTheDocument();
  });

  // Everything the view renders above the bar describes the entity, so it stays put.
  it('replaces only what sits below the bar', () => {
    mocks.tabs = [{ id: 'tab-sources', name: 'Sources' }];
    mocks.activeTabId = 'tab-sources';
    render(<Harness />);

    expect(screen.getByTestId('shared-chrome')).toBeInTheDocument();
  });

  describe('Overview collision', () => {
    it("drops the entity's own Overview tab", () => {
      mocks.tabs = [
        { id: 'tab-overview', name: 'Overview' },
        { id: 'tab-sources', name: 'Sources' },
      ];
      render(<Harness />);

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
      render(<Harness />);

      expect(tabLabels()).toEqual(['Overview', 'Sources']);
    });

    // A dropped tab is not in the list the active tab is matched against, so a link to it lands on
    // the custom view rather than on nothing.
    it('lands on the custom view when a link points at the suppressed tab', () => {
      mocks.tabs = [
        { id: 'tab-overview', name: 'Overview' },
        { id: 'tab-sources', name: 'Sources' },
      ];
      mocks.activeTabId = 'tab-overview';
      render(<Harness />);

      expect(screen.getByTestId('overview-content')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-blocks')).not.toBeInTheDocument();
    });

    /**
     * `TabGroup` decides which tab is selected by matching hrefs, which assumes the active tab is
     * in the list. It is not here: the URL names a tab that was dropped, so without saying outright
     * that Overview is the selected one, every tab in the bar reads as unselected.
     *
     * Reachable from a shared link, and from leaving edit mode while the entity's own Overview tab
     * is open — the editable bar still links to it.
     */
    it('keeps Overview reading as selected when the link points at the suppressed tab', () => {
      mocks.tabs = [
        { id: 'tab-overview', name: 'Overview' },
        { id: 'tab-sources', name: 'Sources' },
      ];
      mocks.activeTabId = 'tab-overview';
      render(<Harness />);

      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('data-active', 'true');
    });

    it('offers no bar when the only other tab was the suppressed one', () => {
      mocks.tabs = [{ id: 'tab-overview', name: 'Overview' }];
      render(<Harness />);

      expect(screen.queryByTestId('tab-group')).not.toBeInTheDocument();
      expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    });
  });
});
