import { describe, expect, it } from 'vitest';

import type { Filter } from './filters';
import {
  applyDropdownSelectionsToFilters,
  dropdownSelectionsStorageKey,
  effectiveDropdownSelection,
  filterDefaultsForColumn,
  parseStoredDropdownSelections,
  toggleDropdownSelection,
} from './table-dropdown-selections';

const TOPICS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const AUTHORS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';

const relationFilter = (columnId: string, value: string, overrides: Partial<Filter> = {}): Filter => ({
  columnId,
  columnName: 'Topics',
  valueType: 'RELATION',
  value,
  valueName: null,
  ...overrides,
});

describe('parseStoredDropdownSelections', () => {
  it('returns no overrides for missing or corrupt storage', () => {
    expect(parseStoredDropdownSelections(null)).toEqual({});
    expect(parseStoredDropdownSelections('not json')).toEqual({});
    expect(parseStoredDropdownSelections('"a string"')).toEqual({});
    expect(parseStoredDropdownSelections('[1,2]')).toEqual({});
  });

  it('keeps only non-empty string-array entries and dedupes ids', () => {
    const raw = JSON.stringify({
      [TOPICS]: ['t1', 't1', 't2', 7, ''],
      [AUTHORS]: [],
      junk: 'nope',
    });
    expect(parseStoredDropdownSelections(raw)).toEqual({ [TOPICS]: ['t1', 't2'] });
  });
});

describe('toggleDropdownSelection', () => {
  it('starts from the filter default when there is no override yet', () => {
    const next = toggleDropdownSelection({}, TOPICS, 't3', ['t1', 't2']);
    expect(next[TOPICS]).toEqual(['t1', 't2', 't3']);
  });

  it('drops the override when the selection returns to the filter default', () => {
    const withOverride = toggleDropdownSelection({}, TOPICS, 't3', ['t1', 't2']);
    const backToDefault = toggleDropdownSelection(withOverride, TOPICS, 't3', ['t1', 't2']);
    expect(backToDefault).toEqual({});
  });

  it('drops the override when every option is unchecked', () => {
    const one = toggleDropdownSelection({}, TOPICS, 't1', []);
    expect(one).toEqual({ [TOPICS]: ['t1'] });
    expect(toggleDropdownSelection(one, TOPICS, 't1', [])).toEqual({});
  });

  it('leaves other columns untouched', () => {
    const next = toggleDropdownSelection({ [AUTHORS]: ['p1'] }, TOPICS, 't1', []);
    expect(next[AUTHORS]).toEqual(['p1']);
  });
});

describe('effectiveDropdownSelection', () => {
  it('prefers the override and falls back to the filter default', () => {
    expect(effectiveDropdownSelection({ [TOPICS]: ['t9'] }, TOPICS, ['t1'])).toEqual(['t9']);
    expect(effectiveDropdownSelection({}, TOPICS, ['t1'])).toEqual(['t1']);
  });
});

describe('filterDefaultsForColumn', () => {
  it('collects that column values and ignores backlinks', () => {
    const filters = [
      relationFilter(TOPICS, 't1'),
      relationFilter(TOPICS, 't2'),
      relationFilter(TOPICS, 'b1', { isBacklink: true }),
      relationFilter(AUTHORS, 'p1'),
    ];
    expect(filterDefaultsForColumn(filters, TOPICS)).toEqual(['t1', 't2']);
  });
});

describe('applyDropdownSelectionsToFilters', () => {
  const base = [relationFilter(TOPICS, 't1'), relationFilter(AUTHORS, 'p1')];

  it('is a no-op without overrides on dropdown columns', () => {
    const result = applyDropdownSelectionsToFilters(base, { [TOPICS]: 'OR' }, {}, [TOPICS]);
    expect(result.filterState).toBe(base);
    expect(result.modesByColumn).toEqual({ [TOPICS]: 'OR' });
  });

  it('replaces the overridden column filters and ORs multiple selections', () => {
    const result = applyDropdownSelectionsToFilters(base, {}, { [TOPICS]: ['t2', 't3'] }, [TOPICS]);

    expect(result.filterState.filter(f => f.columnId === TOPICS).map(f => f.value)).toEqual(['t2', 't3']);
    expect(result.modesByColumn[TOPICS]).toBe('OR');
    // Other columns pass through untouched.
    expect(result.filterState.filter(f => f.columnId === AUTHORS)).toEqual([relationFilter(AUTHORS, 'p1')]);
  });

  it('does not mark OR for a single selection and clears a stale mode', () => {
    const result = applyDropdownSelectionsToFilters(base, { [TOPICS]: 'OR' }, { [TOPICS]: ['t2'] }, [TOPICS]);
    expect(result.modesByColumn[TOPICS]).toBeUndefined();
    expect(result.filterState.filter(f => f.columnId === TOPICS).map(f => f.value)).toEqual(['t2']);
  });

  it('ignores overrides for columns that are not configured dropdowns', () => {
    const result = applyDropdownSelectionsToFilters(base, {}, { [AUTHORS]: ['p2'] }, [TOPICS]);
    expect(result.filterState).toBe(base);
  });

  it('inherits the column name and relation value types from the replaced filter', () => {
    const typed = [relationFilter(TOPICS, 't1', { relationValueTypes: [{ id: 'ty1', name: 'Topic' }] })];
    const result = applyDropdownSelectionsToFilters(typed, {}, { [TOPICS]: ['t2'] }, [TOPICS]);
    expect(result.filterState[0]).toMatchObject({
      columnId: TOPICS,
      columnName: 'Topics',
      value: 't2',
      relationValueTypes: [{ id: 'ty1', name: 'Topic' }],
    });
  });

  it('leaves backlink filters on the overridden column in place', () => {
    const withBacklink = [...base, relationFilter(TOPICS, 'b1', { isBacklink: true })];
    const result = applyDropdownSelectionsToFilters(withBacklink, {}, { [TOPICS]: ['t2'] }, [TOPICS]);
    expect(result.filterState.some(f => f.isBacklink)).toBe(true);
  });
});

describe('id-form and backlink edge cases', () => {
  it('drops the override when a re-checked default differs only in id form', () => {
    const dashless = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const dashed = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
    // Uncheck the (dashless) default, then re-check it via a (dashed) option.
    const cleared = toggleDropdownSelection({}, TOPICS, dashless, [dashless]);
    const restored = toggleDropdownSelection(cleared, TOPICS, dashed, [dashless]);
    expect(restored).toEqual({});
  });

  it('keeps the column mode when a backlink filter shares the overridden column', () => {
    const filters = [relationFilter(TOPICS, 't1'), relationFilter(TOPICS, 'b1', { isBacklink: true })];
    const result = applyDropdownSelectionsToFilters(filters, { [TOPICS]: 'OR' }, { [TOPICS]: ['t2'] }, [TOPICS]);
    // One selection, but the surviving backlink still needs the OR group.
    expect(result.modesByColumn[TOPICS]).toBe('OR');
    expect(result.filterState.some(f => f.isBacklink)).toBe(true);
  });
});

describe('dropdownSelectionsStorageKey', () => {
  it('scopes storage to the block relation entity', () => {
    expect(dropdownSelectionsStorageKey('rel-1')).toBe('tableDropdownSelections:rel-1');
    expect(dropdownSelectionsStorageKey('rel-1')).not.toBe(dropdownSelectionsStorageKey('rel-2'));
  });
});

describe('backlink-aware defaults and rebuilds', () => {
  const backlinkByFlag: Filter = {
    columnId: 'p1',
    columnName: 'Topics',
    valueType: 'RELATION',
    value: 'b-1',
    valueName: null,
    isBacklink: true,
  };
  const backlinkByName: Filter = {
    columnId: 'p1',
    columnName: 'Backlink',
    valueType: 'RELATION',
    value: 'b-2',
    valueName: null,
  };
  const forward: Filter = {
    columnId: 'p1',
    columnName: 'Topics',
    valueType: 'RELATION',
    value: 'v-1',
    valueName: 'Value One',
    typesRelationSpaceId: 'space-s',
  };

  it('excludes both backlink encodings from the column defaults', () => {
    expect(filterDefaultsForColumn([backlinkByFlag, backlinkByName, forward], 'p1')).toEqual(['v-1']);
  });

  it('keeps a still-checked base filter verbatim and scopes new values like the template', () => {
    const { filterState } = applyDropdownSelectionsToFilters([forward], {}, { p1: ['v-1', 'v-2'] }, ['p1']);
    const kept = filterState.find(f => f.value === 'v-1');
    const added = filterState.find(f => f.value === 'v-2');
    // Reused object: valueName and space scoping survive untouched.
    expect(kept).toBe(forward);
    expect(added?.typesRelationSpaceId).toBe('space-s');
  });

  it('preserves legacy-marked backlinks and their OR mode while replacing forward filters', () => {
    const { filterState, modesByColumn } = applyDropdownSelectionsToFilters(
      [backlinkByName, forward],
      { p1: 'OR' },
      { p1: ['v-2'] },
      ['p1']
    );
    expect(filterState).toContain(backlinkByName);
    expect(filterState.some(f => f.value === 'v-1')).toBe(false);
    // Single selection with a backlink sharing the column must not delete the mode.
    expect(modesByColumn.p1).toBe('OR');
  });
});
