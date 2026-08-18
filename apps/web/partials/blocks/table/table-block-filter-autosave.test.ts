import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';

import {
  type PromptState,
  buildSessionBaselineFromCommittedFilters,
  collectFiltersToApply,
  draftHasPending,
  getInitialState,
  mergeFilterRows,
  reducer,
  seedColumnDraftFromCommittedFilters,
} from './table-block-filter-prompt-state';

const TYPES_COLUMN = SystemIds.TYPES_PROPERTY;

// Mirrors what `TableBlockEditableFilters` passes: Name plus the schema's filterable
// properties. Space is deliberately absent — it is not a schema property, so it never
// reaches the picker.
const options: (Filter & { columnName: string })[] = [
  { columnId: SystemIds.NAME_PROPERTY, columnName: 'Name', valueType: 'TEXT', value: '', valueName: null },
  { columnId: TYPES_COLUMN, columnName: 'Types', valueType: 'RELATION', value: '', valueName: null },
];

const PDF = { id: 'pdf-type-id', name: 'PDF' };
const VIDEO = { id: 'video-type-id', name: 'Video' };

function nameFilter(value: string): Filter {
  return {
    columnId: SystemIds.NAME_PROPERTY,
    columnName: 'Name',
    valueType: 'TEXT',
    value,
    valueName: null,
  };
}

function committedTypeFilter(pick: { id: string; name: string }): Filter {
  return {
    columnId: TYPES_COLUMN,
    columnName: 'Types',
    valueType: 'RELATION',
    value: pick.id,
    valueName: pick.name,
  };
}

/**
 * Switch the filtered column the way `onSelectColumnToFilter` does. The seed matters: a
 * bare `selectColumn` starts the column from an empty draft, which a later commit would
 * read as "the user cleared this filter".
 */
function selectColumn(state: PromptState, columnId: string, committedFilters: Filter[]): PromptState {
  const stored = state.columnDrafts[columnId];
  const committedDraft = seedColumnDraftFromCommittedFilters(columnId, committedFilters, options);
  const seedDraft =
    stored === undefined ||
    (!draftHasPending(stored, columnId, options) && draftHasPending(committedDraft, columnId, options))
      ? committedDraft
      : undefined;
  return reducer(state, { type: 'selectColumn', payload: { columnId, seedDraft } });
}

/** Open the popover the way `onOpenChange(true)` does, seeded from committed table filters. */
function openOn(committedFilters: Filter[], columnId = TYPES_COLUMN): PromptState {
  const opened = reducer(getInitialState({ type: 'GEO' }), {
    type: 'reset',
    payload: {
      source: { type: 'GEO' },
      open: true,
      seedDraft: seedColumnDraftFromCommittedFilters(SystemIds.NAME_PROPERTY, committedFilters, options),
      sessionBaseline: buildSessionBaselineFromCommittedFilters(options, committedFilters),
    },
  });
  return selectColumn(opened, columnId, committedFilters);
}

/** What a value dropdown now dispatches on every checkbox toggle. */
function toggle(state: PromptState, selections: { id: string; name: string | null }[]): PromptState {
  return reducer(state, { type: 'commitEntitySelections', payload: { selections } });
}

describe('data block filter autosave', () => {
  it('applies a selection made after the popover was opened', () => {
    const state = toggle(openOn([]), [PDF]);

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);

    expect(touchedColumnIds).toEqual([TYPES_COLUMN]);
    expect(filters).toEqual([expect.objectContaining({ columnId: TYPES_COLUMN, value: PDF.id, valueName: PDF.name })]);
  });

  it('applies a selection added to an existing filter', () => {
    const state = toggle(openOn([committedTypeFilter(PDF)]), [PDF, VIDEO]);

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);

    expect(touchedColumnIds).toEqual([TYPES_COLUMN]);
    expect(filters.map(row => row.value)).toEqual([PDF.id, VIDEO.id]);
  });

  it('applies a removal as an empty filter set for that column', () => {
    const state = toggle(openOn([committedTypeFilter(PDF)]), []);

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);

    expect(touchedColumnIds).toEqual([TYPES_COLUMN]);
    expect(filters).toEqual([]);
  });

  it('is a no-op when the popover is opened and dismissed without edits', () => {
    const { filters, touchedColumnIds } = collectFiltersToApply(openOn([committedTypeFilter(PDF)]), options);

    expect(touchedColumnIds).toEqual([]);
    expect(filters).toEqual([]);
  });

  it('is a no-op when a selection is toggled back to what was already committed', () => {
    const opened = openOn([committedTypeFilter(PDF)]);
    const state = toggle(toggle(opened, [PDF, VIDEO]), [PDF]);

    expect(collectFiltersToApply(state, options).touchedColumnIds).toEqual([]);
  });

  it('keeps edits made across more than one column in the same session', () => {
    const withTypes = toggle(openOn([]), [PDF]);
    const onName = selectColumn(withTypes, SystemIds.NAME_PROPERTY, []);
    const state = reducer(onName, { type: 'selectStringValue', payload: { value: 'report' } });

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);

    expect(new Set(touchedColumnIds)).toEqual(new Set([TYPES_COLUMN, SystemIds.NAME_PROPERTY]));
    expect(filters.map(row => row.value)).toEqual(expect.arrayContaining([PDF.id, 'report']));
  });

  it("keeps an earlier column's edit when the user switches columns and back", () => {
    const withTypes = toggle(openOn([]), [PDF]);
    const away = selectColumn(withTypes, SystemIds.NAME_PROPERTY, []);
    const back = selectColumn(away, TYPES_COLUMN, []);

    expect(collectFiltersToApply(back, options).filters.map(row => row.value)).toEqual([PDF.id]);
  });

  it('applies typed text filters without a Done click', () => {
    const opened = openOn([], SystemIds.NAME_PROPERTY);
    const state = reducer(opened, { type: 'selectStringValue', payload: { value: 'annual report' } });

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);

    expect(touchedColumnIds).toEqual([SystemIds.NAME_PROPERTY]);
    expect(filters).toEqual([expect.objectContaining({ columnId: SystemIds.NAME_PROPERTY, value: 'annual report' })]);
  });

  it('drops every pending draft once a commit has been made', () => {
    const state = reducer(toggle(openOn([]), [PDF]), { type: 'done' });

    expect(state.open).toBe(false);
    expect(collectFiltersToApply(state, options).touchedColumnIds).toEqual([]);
  });
});

/**
 * The filter chips outside the popover render from this: the same commit payload, folded
 * into the committed filters, so a selection shows up before it is applied.
 */
function preview(state: PromptState, committedFilters: Filter[]): Filter[] {
  const { filters, touchedColumnIds } = collectFiltersToApply(state, options);
  return mergeFilterRows(committedFilters, filters, touchedColumnIds);
}

describe('pending filter preview', () => {
  it('shows a selection that has not been applied yet', () => {
    const state = toggle(openOn([]), [PDF]);

    expect(preview(state, [])).toEqual([
      expect.objectContaining({ columnId: TYPES_COLUMN, value: PDF.id, valueName: PDF.name }),
    ]);
  });

  it('replaces a column in place rather than appending it', () => {
    const committed = [committedTypeFilter(PDF), nameFilter('report')];
    const state = toggle(openOn(committed), [PDF, VIDEO]);

    expect(preview(state, committed).map(f => f.columnId)).toEqual([
      TYPES_COLUMN,
      TYPES_COLUMN,
      SystemIds.NAME_PROPERTY,
    ]);
  });

  it('drops a chip as soon as its selection is unchecked', () => {
    const committed = [committedTypeFilter(PDF)];
    const state = toggle(openOn(committed), []);

    expect(preview(state, committed)).toEqual([]);
  });

  it('leaves untouched columns alone', () => {
    const committed = [nameFilter('report')];
    const state = toggle(openOn(committed), [PDF]);

    expect(preview(state, committed).map(f => f.value)).toEqual(['report', PDF.id]);
  });

  it('matches what dismissing the popover actually applies', () => {
    const committed = [committedTypeFilter(PDF), nameFilter('report')];
    const state = toggle(openOn(committed), [VIDEO]);

    const { filters, touchedColumnIds } = collectFiltersToApply(state, options);
    expect(preview(state, committed)).toEqual(mergeFilterRows(committed, filters, touchedColumnIds));
  });
});
