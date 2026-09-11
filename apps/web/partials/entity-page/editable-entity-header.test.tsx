import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditableHeading } from './editable-entity-header';

type StoredValue = {
  entity: { id: string };
  spaceId: string;
  property: { id: string };
  value: string;
  isDeleted?: boolean;
};

const mocks = vi.hoisted(() => ({
  isEditing: false,
  values: [] as unknown[],
  setName: vi.fn(),
}));

// The selector under test is the whole point of this file, so it runs for real against the fixture
// below rather than being replaced by a canned name.
vi.mock('@xstate/store/react', () => ({
  useSelector: (snapshot: unknown, selector: (value: unknown) => unknown) => selector(snapshot),
}));

vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ values: mocks.values }) }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { entities: { name: { set: mocks.setName } } } }),
}));

function storedName(overrides: Partial<StoredValue> = {}): StoredValue {
  return {
    entity: { id: 'entity-1' },
    spaceId: 'space-1',
    property: { id: SystemIds.NAME_PROPERTY },
    value: 'Stored name',
    ...overrides,
  };
}

function renderHeading(fallbackName?: string | null) {
  return render(<EditableHeading spaceId="space-1" entityId="entity-1" fallbackName={fallbackName} />);
}

/** The editing surface: a textarea rather than an `h1`. */
function titleInput() {
  return screen.getByPlaceholderText('Entity name...') as HTMLTextAreaElement;
}

beforeEach(() => {
  mocks.isEditing = false;
  mocks.values = [];
  mocks.setName = vi.fn();
});

afterEach(cleanup);

/**
 * `fallbackName` is the preview name the caller already has — the row the reader clicked to open the
 * side panel. It exists so the panel has a title before the scoped store hydrates.
 *
 * It must never reach edit mode. A name in the textarea reads as a stored name, and the first
 * keystroke would commit the preview into the graph as though the editor had typed it.
 */
describe('EditableHeading fallbackName', () => {
  it('titles the browse view when the store has no name yet', () => {
    renderHeading('Preview name');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Preview name');
  });

  it('gives way to the stored name once it arrives', () => {
    mocks.values = [storedName()];
    renderHeading('Preview name');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stored name');
  });

  it('never pre-fills the editing textarea', () => {
    mocks.isEditing = true;
    renderHeading('Preview name');

    expect(titleInput()).toHaveValue('');
  });

  it('still shows the stored name while editing', () => {
    mocks.isEditing = true;
    mocks.values = [storedName()];
    renderHeading('Preview name');

    expect(titleInput()).toHaveValue('Stored name');
  });

  it('leaves the title empty in browse mode when there is neither', () => {
    renderHeading();

    // A zero-width space holds the line open; what matters is that no name is claimed.
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Preview name');
  });
});

/**
 * An entity carries a separate name in each space it lives in. Reading by entity alone returns
 * whichever the store happened to hold first, so the page can be titled out of a space the reader
 * is not in — and an edit would then be applied over the name they were shown.
 */
describe('EditableHeading name scope', () => {
  it('reads the name with both the entity and the space', () => {
    mocks.values = [
      storedName({ spaceId: 'space-2', value: 'Name in another space' }),
      storedName({ value: 'Name in this space' }),
    ];
    renderHeading();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Name in this space');
  });

  it('ignores a name held for a different entity in the same space', () => {
    mocks.values = [storedName({ entity: { id: 'entity-2' }, value: 'Another entity' })];
    renderHeading('Preview name');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Preview name');
  });

  it('ignores a deleted name', () => {
    mocks.values = [storedName({ isDeleted: true, value: 'Deleted name' })];
    renderHeading('Preview name');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Preview name');
  });

  it('writes an edit back to the same entity and space it read', () => {
    mocks.isEditing = true;
    renderHeading();

    // Typing into the textarea rather than calling the handler, so the write path is pinned end to
    // end — a scope dropped on the write side fails here too.
    fireEvent.change(titleInput(), { target: { value: 'Typed name' } });

    expect(mocks.setName).toHaveBeenCalledWith('entity-1', 'space-1', 'Typed name');
  });
});
