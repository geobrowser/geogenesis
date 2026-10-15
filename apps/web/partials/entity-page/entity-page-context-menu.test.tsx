import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EntitySidePanelEditContext,
  type EntitySidePanelEditContextValue,
} from '~/core/state/entity-side-panel-edit-context';

import { EntityPageContextMenu } from './entity-page-context-menu';

const mocks = vi.hoisted(() => ({
  globalEditable: false,
}));

// The real `useUserIsEditing` runs: which edit state wins, the page's or the panel's, is the subject.
vi.mock('~/core/state/editable-store', () => ({
  useEditable: () => ({ editable: mocks.globalEditable, setEditable: vi.fn() }),
}));
vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ isMember: true, isEditor: true, canEdit: true, isLoading: false }),
}));
vi.mock('~/core/hooks/use-hydrated', () => ({ useHydrated: () => true }));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { values: { deleteMany: vi.fn() }, relations: { deleteMany: vi.fn() } } }),
}));
vi.mock('~/core/sync/use-store', () => ({
  useValues: () => [],
  useRelations: () => [],
  getValues: () => [],
  getRelations: () => [],
}));

// Radix wants a portal and an open state; this file is about which items the menu offers.
vi.mock('~/design-system/menu', () => ({
  Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/design-system/tooltip', () => ({
  Tooltip: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock('~/partials/versions/create-new-version-in-space', () => ({ CreateNewVersionInSpace: () => null }));
vi.mock('~/partials/versions/move-entity-to-space', () => ({ MoveEntityToSpace: () => null }));
vi.mock('./entity-to-space-dialog', () => ({ EntityToSpaceDialog: () => null }));

function panel(spaceId: string, panelWantsEdit: boolean): EntitySidePanelEditContextValue {
  return {
    spaceId,
    panelWantsEdit,
    setPanelWantsEdit: vi.fn(),
    openedWithMainViewEditing: false,
    openedFromReviewEdits: false,
  };
}

function renderMenu(context: EntitySidePanelEditContextValue | null) {
  return render(
    <EntitySidePanelEditContext.Provider value={context}>
      <EntityPageContextMenu entityId="entity-1" entityName="A claim" spaceId="space-1" />
    </EntitySidePanelEditContext.Provider>
  );
}

beforeEach(() => {
  mocks.globalEditable = false;
});

afterEach(() => {
  cleanup();
});

describe('EntityPageContextMenu edit-only items', () => {
  it('offers Move and Delete on a page in edit mode', () => {
    mocks.globalEditable = true;
    renderMenu(null);

    expect(screen.getByRole('button', { name: /Move to/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete entity/ })).toBeInTheDocument();
  });

  it('offers them in a side panel being edited over a page that is not', () => {
    renderMenu(panel('space-1', true));

    expect(screen.getByRole('button', { name: /Move to/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete entity/ })).toBeInTheDocument();
  });

  it('withholds them in a side panel being read over a page that is in edit mode', () => {
    mocks.globalEditable = true;
    renderMenu(panel('space-1', false));

    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete entity/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Copy ID/ })).toBeInTheDocument();
  });
});
