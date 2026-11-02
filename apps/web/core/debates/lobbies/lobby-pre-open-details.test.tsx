import { describe, expect, it } from 'vitest';

import { goingNamesLabel } from './lobby-pre-open-details';

const named = (...names: string[]) => names.map(display_name => ({ display_name }));

describe('goingNamesLabel', () => {
  it('names two people and counts the rest against the true total', () => {
    expect(goingNamesLabel(named('Ana', 'Ben', 'Cy'), 14)).toBe('Ana, Ben and 12 more going');
  });

  it('names everyone when they are all listed', () => {
    expect(goingNamesLabel(named('Ana'), 1)).toBe('Ana going');
    expect(goingNamesLabel(named('Ana', 'Ben'), 2)).toBe('Ana and Ben going');
  });

  it('falls back to the count from a geo-chat that names nobody', () => {
    expect(goingNamesLabel(undefined, 5)).toBe('5 going');
  });

  it('says nothing with nobody going', () => {
    expect(goingNamesLabel(named(), 0)).toBeNull();
  });
});
