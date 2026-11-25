import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityTabs } from './entity-tabs';

const mocks = vi.hoisted(() => ({
  canEdit: false,
  editable: false,
  editingSpace: null as string | null,
  readTabs: null as Array<{ label: string; href: string; activeOnRecordRoutes?: boolean }> | null,
  sidePanel: null as null | {
    activeTabId: string | null;
    activeSystemTab: string | null;
    setActiveTabId: ReturnType<typeof vi.fn>;
    setActiveSystemTab: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({
  useCanUserEdit: () => mocks.canEdit,
  useUserIsEditing: (spaceId: string) => {
    mocks.editingSpace = spaceId;
    return mocks.editable;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: { id: 'claim-1', types: [] } }),
  useRelations: ({ mergeWith }: { mergeWith: unknown[] }) => mergeWith,
  useValues: () => [],
}));

vi.mock('~/core/state/entity-side-panel-active-tab', () => ({
  useEntitySidePanelActiveTab: () => mocks.sidePanel,
}));

vi.mock('~/design-system/tab-group', () => ({
  TabGroup: ({ tabs }: { tabs: Array<{ label: string; href: string }> }) => {
    mocks.readTabs = tabs;
    return <div data-testid="read-tabs" />;
  },
}));

vi.mock('./editable-tab-group', () => ({
  EditableTabGroup: () => <div data-testid="editable-tabs" />,
}));

const RELATIONS = [
  {
    id: 'relation-1',
    fromEntity: { id: 'claim-1' },
    toEntity: { id: 'tab-1', name: 'Debates' },
    type: { id: 'tabs' },
    spaceId: 'space-1',
  },
];

beforeEach(() => {
  mocks.canEdit = false;
  mocks.editable = false;
  mocks.editingSpace = null;
  mocks.readTabs = null;
  mocks.sidePanel = null;
});

afterEach(cleanup);

describe('EntityTabs access and system tabs', () => {
  it('uses the access-controlled editing state for the current space', () => {
    mocks.canEdit = true;
    mocks.editable = true;

    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={RELATIONS as never[]}
        tabEntities={[{ id: 'tab-1', name: 'Debates' }]}
      />
    );

    expect(mocks.editingSpace).toBe('space-1');
    expect(screen.getByTestId('editable-tabs')).toBeInTheDocument();
  });

  it('keeps edit controls hidden until current-space access resolves', () => {
    mocks.editable = true;

    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={RELATIONS as never[]}
        tabEntities={[{ id: 'tab-1', name: 'Debates' }]}
      />
    );

    expect(screen.queryByTestId('editable-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('read-tabs')).toBeInTheDocument();
  });

  it('keeps product tabs and hides colliding authored labels in browse mode', () => {
    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={RELATIONS as never[]}
        tabEntities={[{ id: 'tab-1', name: 'Debates' }]}
        systemTabsBefore={[
          { label: 'Overview', href: '/claim' },
          { label: 'Debates', href: '/claim/debates' },
        ]}
        reservedSystemLabels={['Overview', 'Debates']}
      />
    );

    expect(mocks.readTabs?.map(tab => tab.label)).toEqual(['Overview', 'Debates']);
  });

  it('keeps an authored label when the matching product tab is not available', () => {
    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={RELATIONS as never[]}
        tabEntities={[{ id: 'tab-1', name: 'Debates' }]}
        systemTabsBefore={[{ label: 'Overview', href: '/claim' }]}
        reservedSystemLabels={['Overview']}
      />
    );

    expect(mocks.readTabs?.map(tab => tab.label)).toEqual(['Overview', 'Debates']);
  });

  it('returns a side panel to Overview when its selected system tab disappears', () => {
    const setActiveSystemTab = vi.fn();
    mocks.sidePanel = {
      activeTabId: null,
      activeSystemTab: 'sources',
      setActiveTabId: vi.fn(),
      setActiveSystemTab,
    };

    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={[]}
        tabEntities={[]}
        systemTabsBefore={[{ label: 'Overview', href: '/claim', sidePanelKey: 'overview' }]}
      />
    );

    expect(setActiveSystemTab).toHaveBeenCalledWith('overview');
  });

  it('keeps a templated entity’s record tab through edit mode, showing it as Overview (GEO-3820)', () => {
    const setActiveSystemTab = vi.fn();
    const setActiveTabId = vi.fn();
    mocks.sidePanel = { activeTabId: null, activeSystemTab: 'debates', setActiveTabId, setActiveSystemTab };

    render(
      <EntityTabs
        entityId="claim-1"
        spaceId="space-1"
        initialTabRelations={RELATIONS as never}
        tabEntities={[]}
        keepRecordTabSelection
      />
    );

    // Not reset to Overview, so leaving edit mode returns to Debates.
    expect(setActiveSystemTab).not.toHaveBeenCalled();
    expect(setActiveTabId).not.toHaveBeenCalled();
    // On the full page, Overview stays selected on /debates.
    expect(mocks.readTabs?.[0]).toMatchObject({ label: 'Overview', activeOnRecordRoutes: true });
  });

  it('still resets a generic entity’s unknown side-panel tab', () => {
    const setActiveTabId = vi.fn();
    mocks.sidePanel = { activeTabId: null, activeSystemTab: 'debates', setActiveTabId, setActiveSystemTab: vi.fn() };

    render(<EntityTabs entityId="claim-1" spaceId="space-1" initialTabRelations={[]} tabEntities={[]} />);

    expect(setActiveTabId).toHaveBeenCalledWith(null);
  });
});
