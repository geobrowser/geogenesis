import { describe, expect, it } from 'vitest';
import { dedupe } from './sync';

describe('dedupe', () => {
  it('Returns array with union of identifiable objects', () => {
    const local = [{ id: '1' }, { id: '2' }];
    const server = [{ id: '3' }, { id: '4' }];
    const localIds = new Set(['1', '2']);
    const result = dedupe(local, server, localIds);
    expect(result).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]);
  });
});
