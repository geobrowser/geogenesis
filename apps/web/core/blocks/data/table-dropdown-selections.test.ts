import { describe, expect, it } from 'vitest';

import type { Filter } from './filters';
import {
  applyDropdownSelectionsToFilters,
  dropdownSelectionsStorageKey,
  effectiveDropdownMode,
  effectiveDropdownSelection,
  filterDefaultsForColumn,
  parseStoredDropdownState,
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

describe('parseStoredDropdownState', () => {
  it('returns no overrides for missing or corrupt storage', () => {
    expect(parseStoredDropdownState(null)).toEqual({ selections: {}, modes: {} });
    expect(parseStoredDropdownState('not json')).toEqual({ selections: {}, modes: {} });
    expect(parseStoredDropdownState('"a string"')).toEqual({ selections: {}, modes: {} });
    expect(parseStoredDropdownState('[1,2]')).toEqual({ selections: {}, modes: {} });
  });

  it('reads the legacy bare-selections shape with no stored modes', () => {
    const raw = JSON.stringify({
      [TOPICS]: ['t1', 't1', 't2', 7, ''],
      [AUTHORS]: [],
      junk: 'nope',
    });
    // Master compiled every multi-pick override as OR — legacy storage is
    // stamped so the new preset-inheritance default can't flip it to AND.
    expect(parseStoredDropdownState(raw)).toEqual({
      selections: { [TOPICS]: ['t1', 't2'] },
      modes: { [TOPICS]: 'OR' },
    });
  });

  it('reads the enveloped shape and drops invalid mode values', () => {
    const raw = JSON.stringify({
      selections: { [TOPICS]: ['t1'] },
      modes: { [TOPICS]: 'AND', [AUTHORS]: 'BANANA' },
    });
    expect(parseStoredDropdownState(raw)).toEqual({
      selections: { [TOPICS]: ['t1'] },
      modes: { [TOPICS]: 'AND' },
    });
  });
});

describe('effectiveDropdownMode', () => {
  it('a stored choice always wins', () => {
    expect(effectiveDropdownMode({ [TOPICS]: 'AND' }, TOPICS, [], {})).toBe('AND');
    expect(effectiveDropdownMode({ [TOPICS]: 'OR' }, TOPICS, ['a', 'b'], { [TOPICS]: 'AND' })).toBe('OR');
  });

  it('a multi-value preset inherits the block filter combinator (missing = AND)', () => {
    expect(effectiveDropdownMode({}, TOPICS, ['a', 'b'], {})).toBe('AND');
    expect(effectiveDropdownMode({}, TOPICS, ['a', 'b'], { [TOPICS]: 'OR' })).toBe('OR');
  });

  it('fresh picks default to union — checklist intuition', () => {
    expect(effectiveDropdownMode({}, TOPICS, [], {})).toBe('OR');
    expect(effectiveDropdownMode({}, TOPICS, ['a'], {})).toBe('OR');
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

  it('drops the forward mode for a single selection even when a backlink shares the column', () => {
    const filters = [relationFilter(TOPICS, 't1'), relationFilter(TOPICS, 'b1', { isBacklink: true })];
    const result = applyDropdownSelectionsToFilters(filters, { [TOPICS]: 'OR' }, { [TOPICS]: ['t2'] }, [TOPICS]);
    // Backlinks live in their own logical group (filterGroupKey) and never
    // read the forward group's mode, so a single selection can drop it.
    expect(result.modesByColumn[TOPICS]).toBeUndefined();
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

  it('preserves legacy-marked backlinks while replacing forward filters', () => {
    const { filterState, modesByColumn } = applyDropdownSelectionsToFilters(
      [backlinkByName, forward],
      { p1: 'OR' },
      { p1: ['v-2'] },
      ['p1']
    );
    expect(filterState).toContain(backlinkByName);
    expect(filterState.some(f => f.value === 'v-1')).toBe(false);
    // Backlinks live in their own logical group (filterGroupKey), so the
    // forward group's mode entry can be dropped for a single selection.
    expect(modesByColumn.p1).toBeUndefined();
  });

  it('multi-select ORs the forward group while the backlink stays its own required group', () => {
    const { filterState, modesByColumn } = applyDropdownSelectionsToFilters(
      [backlinkByName, forward],
      {},
      { p1: ['v-2', 'v-3'] },
      ['p1']
    );
    expect(filterState).toContain(backlinkByName);
    expect(modesByColumn.p1).toBe('OR');
    // The where-builder ANDs the backlink group with the OR-ed selections —
    // covered end to end in filter-state-to-where.test.ts.
  });
});

describe('applyDropdownSelectionsToFilters with selection modes', () => {
  const base: Filter = {
    columnId: TOPICS,
    columnName: 'Topics',
    valueType: 'RELATION',
    value: 't1',
    valueName: null,
  };

  it('intersection mode compiles multi-selections to AND', () => {
    const { modesByColumn } = applyDropdownSelectionsToFilters([base], {}, { [TOPICS]: ['t2', 't3'] }, [TOPICS], {
      [TOPICS]: 'AND',
    });
    expect(modesByColumn[TOPICS]).toBe('AND');
  });

  it('defaults multi-selections to OR when no mode is stored and no multi-preset exists', () => {
    const { modesByColumn } = applyDropdownSelectionsToFilters([base], {}, { [TOPICS]: ['t2', 't3'] }, [TOPICS], {});
    expect(modesByColumn[TOPICS]).toBe('OR');
  });

  it('a modified multi-value AND preset keeps intersecting', () => {
    const second: Filter = { ...base, value: 't2' };
    const { modesByColumn } = applyDropdownSelectionsToFilters(
      [base, second],
      {},
      { [TOPICS]: ['t1', 't3'] },
      [TOPICS],
      {}
    );
    // Two block defaults with the format-default AND combinator: refining
    // the list stays an intersection unless the user flips the toggle.
    expect(modesByColumn[TOPICS]).toBe('AND');
  });
});

describe('parseStoredDropdownState envelope guards', () => {
  it('rejects an envelope with null or array selections outright', () => {
    expect(parseStoredDropdownState(JSON.stringify({ selections: null, modes: { a: 'AND' } }))).toEqual({
      selections: {},
      modes: {},
    });
    expect(parseStoredDropdownState(JSON.stringify({ selections: ['a'], modes: {} }))).toEqual({
      selections: {},
      modes: {},
    });
  });
});

describe('mode-only overrides', () => {
  const preset1: Filter = {
    columnId: TOPICS,
    columnName: 'Topics',
    valueType: 'RELATION',
    value: 't1',
    valueName: null,
  };
  const preset2: Filter = {
    columnId: TOPICS,
    columnName: 'Topics',
    valueType: 'RELATION',
    value: 't2',
    valueName: null,
  };

  it('a stored mode with no selections override still reaches the query', () => {
    const { filterState, modesByColumn } = applyDropdownSelectionsToFilters([preset1, preset2], {}, {}, [TOPICS], {
      [TOPICS]: 'OR',
    });
    expect(modesByColumn[TOPICS]).toBe('OR');
    // The preset filters themselves are kept verbatim.
    expect(filterState).toContain(preset1);
    expect(filterState).toContain(preset2);
  });

  it('a stored mode on a single-value preset stays a no-op', () => {
    const { filterState, modesByColumn } = applyDropdownSelectionsToFilters([preset1], {}, {}, [TOPICS], {
      [TOPICS]: 'AND',
    });
    expect(filterState).toEqual([preset1]);
    expect(modesByColumn[TOPICS]).toBeUndefined();
  });
});

describe('effectiveDropdownMode id-form tolerance', () => {
  it('reads a base OR mode stored under the dashed form of the column id', () => {
    const dashless = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const dashed = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
    expect(effectiveDropdownMode({}, dashless, ['a', 'b'], { [dashed]: 'OR' })).toBe('OR');
  });
});
