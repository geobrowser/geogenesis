import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';

const mocks = vi.hoisted(() => ({ storeNames: new Map<string, string>() }));

vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useName: (entityId: string) => mocks.storeNames.get(entityId) ?? null,
}));

const { TableBlockFilterGroupPill, groupFilters } = await import('./table-block-filter-pill');

const VALUE_ID = 'e7d737c536764c609fa16aa64a8c90ad';

function relationFilter(overrides: Partial<Filter> = {}): Filter {
  return {
    columnId: 'column-1',
    columnName: 'Property',
    valueType: 'RELATION',
    value: VALUE_ID,
    valueName: null,
    ...overrides,
  } as Filter;
}

function renderPill(filters: Filter[], isResolvingNames: boolean) {
  const [group] = groupFilters(filters);
  return render(
    <TableBlockFilterGroupPill
      group={group}
      mode="AND"
      onToggleMode={() => {}}
      onDeleteValue={() => {}}
      onClearGroup={() => {}}
      isEditing
      isResolvingNames={isResolvingNames}
    />
  );
}

beforeEach(() => {
  mocks.storeNames = new Map();
});

afterEach(cleanup);

describe('TableBlockFilterGroupPill', () => {
  // The bug: a raw entity id is noise the reader has to look past, and reads as the filter having
  // changed under them.
  it('does not show the entity id while the name is still being looked up', () => {
    renderPill([relationFilter()], true);

    expect(screen.queryByText(VALUE_ID)).not.toBeInTheDocument();
  });

  it('shows the name once it resolves', () => {
    renderPill([relationFilter({ valueName: 'Crypto' })], false);

    expect(screen.getByText('Crypto')).toBeInTheDocument();
    expect(screen.queryByText(VALUE_ID)).not.toBeInTheDocument();
  });

  it('prefers a name already in the local store over waiting', () => {
    mocks.storeNames.set(VALUE_ID, 'Crypto');
    renderPill([relationFilter()], true);

    expect(screen.getByText('Crypto')).toBeInTheDocument();
  });

  // An entity can genuinely have no name. A placeholder that never resolves is worse than an ugly
  // label that does, so once the lookup is done the id is the honest answer again.
  it('falls back to the id once the lookup is done and there is still no name', () => {
    renderPill([relationFilter()], false);

    expect(screen.getByText(VALUE_ID)).toBeInTheDocument();
  });

  // A text filter's value is what the reader typed, so there is nothing to resolve.
  it('shows a text filter value even while relation names are resolving', () => {
    renderPill([relationFilter({ valueType: 'TEXT', value: 'bitcoin', valueName: null })], true);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
  });
});
