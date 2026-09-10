import { describe, expect, it } from 'vitest';

import { type DropdownOption, orderDropdownOptions } from './use-dropdown-options';

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));
const facet = (entries: Record<string, number>) => Object.entries(entries).map(([id, count]) => ({ id, count }));
const ids = (options: DropdownOption[]) => options.map(option => option.id);

describe('orderDropdownOptions', () => {
  it('sinks exhausted options below every option that can still narrow', () => {
    const options = orderDropdownOptions({
      pinned: [],
      entries: facet({ a: 9, b: 0, c: 4, d: 0, e: 1 }),
      counts: counts({ a: 9, b: 0, c: 4, d: 0, e: 1 }),
      checkedIds: [],
    });
    expect(ids(options)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('preserves the incoming order within each half — sinking only moves rows between halves', () => {
    // The facet arrives count-descending and stays that way; the zeros keep
    // their own relative order too rather than being re-sorted.
    const options = orderDropdownOptions({
      pinned: [],
      entries: facet({ z: 0, a: 5, y: 0, b: 3 }),
      counts: counts({ z: 0, a: 5, y: 0, b: 3 }),
      checkedIds: [],
    });
    expect(ids(options)).toEqual(['a', 'b', 'z', 'y']);
  });

  it('keeps a checked option in place at zero, so a selection stays reachable to undo', () => {
    // In intersection mode the viewer's own picks are what drove the other
    // counts to zero; burying the pick would strand them.
    const options = orderDropdownOptions({
      pinned: [],
      entries: facet({ a: 4, picked: 0, b: 0 }),
      counts: counts({ a: 4, picked: 0, b: 0 }),
      checkedIds: ['picked'],
    });
    expect(ids(options)).toEqual(['a', 'picked', 'b']);
    expect(options.find(option => option.id === 'picked')?.isExhausted).toBe(false);
    expect(options.find(option => option.id === 'b')?.isExhausted).toBe(true);
  });

  it('matches a checked id whatever its dash spelling', () => {
    const options = orderDropdownOptions({
      pinned: [],
      entries: facet({ '591f5d7cc3ff48de932ac6f190d21b7b': 0, a: 2 }),
      counts: counts({ '591f5d7cc3ff48de932ac6f190d21b7b': 0, a: 2 }),
      checkedIds: ['591F5D7C-C3FF-48DE-932A-C6F190D21B7B'],
    });
    expect(ids(options)).toEqual(['591f5d7cc3ff48de932ac6f190d21b7b', 'a']);
  });

  it('leads with pinned entries, and sinks an exhausted unchecked pin like any other row', () => {
    const options = orderDropdownOptions({
      pinned: [
        { id: 'preset', name: 'Preset' },
        { id: 'gone', name: 'Gone' },
      ],
      entries: facet({ a: 1 }),
      counts: counts({ preset: 7, a: 1 }),
      checkedIds: ['preset'],
    });
    expect(ids(options)).toEqual(['preset', 'a', 'gone']);
    // A pin the facet never returned counts zero, and keeps its resolved name.
    expect(options[2]).toEqual({ id: 'gone', name: 'Gone', count: 0, isExhausted: true });
  });

  it('sinks nothing while the counts are still unknown', () => {
    // Counts are null between a re-keyed population and its facet landing;
    // an undefined count is not a definite zero, so the list must not churn.
    const options = orderDropdownOptions({
      pinned: [{ id: 'preset', name: 'Preset' }],
      entries: facet({ a: 0, b: 0 }),
      counts: null,
      checkedIds: [],
    });
    expect(ids(options)).toEqual(['preset', 'a', 'b']);
    expect(options.every(option => option.isExhausted === false)).toBe(true);
    expect(options.every(option => option.count === undefined)).toBe(true);
  });

  it('does not list a facet entry that is already pinned', () => {
    const options = orderDropdownOptions({
      pinned: [{ id: 'a', name: 'Alpha' }],
      entries: facet({ a: 3, b: 1 }),
      counts: counts({ a: 3, b: 1 }),
      checkedIds: [],
    });
    expect(ids(options)).toEqual(['a', 'b']);
    expect(options[0].name).toBe('Alpha');
  });
});
