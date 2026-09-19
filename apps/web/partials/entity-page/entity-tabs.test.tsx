import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityTabs } from './entity-tabs';

const mocks = vi.hoisted(() => ({
  editable: false,
  editingSpace: null as string | null,
  readTabs: null as Array<{ label: string; href: string }> | null,
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({
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
  mocks.editable = false;
  mocks.editingSpace = null;
  mocks.readTabs = null;
});

afterEach(cleanup);

describe('EntityTabs access and system tabs', () => {
  it('uses the access-controlled editing state for the current space', () => {
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
});
