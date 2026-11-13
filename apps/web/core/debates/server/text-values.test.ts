import { describe, expect, it, vi } from 'vitest';

import { TEXT_VALUES_MAX_IDS, type TextValuesPageFetcher, readTextValues } from './text-values';

const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const PROPERTY = '806d52bc27e94c9193c057978b093351';

const id = (n: number) => n.toString(16).padStart(32, '0');

describe('readTextValues', () => {
  it('reads one page with room for one more row than there are ids', async () => {
    const fetchPage = vi.fn<TextValuesPageFetcher>(async () => [{ entityId: id(1), text: 'A' }]);
    await expect(readTextValues([id(1), id(2)], PROPERTY, SPACE, fetchPage)).resolves.toEqual([
      { entityId: id(1), text: 'A' },
    ]);
    expect(fetchPage).toHaveBeenCalledWith({
      ids: [id(1), id(2)],
      propertyId: PROPERTY,
      spaceId: SPACE,
      first: TEXT_VALUES_MAX_IDS + 1,
    });
  });

  it('skips the read when there are no ids', async () => {
    const fetchPage = vi.fn<TextValuesPageFetcher>();
    await expect(readTextValues([], PROPERTY, SPACE, fetchPage)).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('accepts the most ids the read allows, one value each', async () => {
    const ids = Array.from({ length: TEXT_VALUES_MAX_IDS }, (_, n) => id(n + 1));
    const fetchPage = vi.fn<TextValuesPageFetcher>(async request =>
      request.ids.map(entityId => ({ entityId, text: 'x' }))
    );
    await expect(readTextValues(ids, PROPERTY, SPACE, fetchPage)).resolves.toHaveLength(TEXT_VALUES_MAX_IDS);
  });

  // A full page may have been cut short: a value past it would read as "no value".
  it('throws when the page comes back full', async () => {
    const fetchPage = vi.fn<TextValuesPageFetcher>(async request =>
      Array.from({ length: request.first }, () => ({ entityId: id(1), text: 'x' }))
    );
    await expect(readTextValues([id(1)], PROPERTY, SPACE, fetchPage)).rejects.toThrow('came back full');
  });

  it('refuses more ids than the read allows, without reading', async () => {
    const ids = Array.from({ length: TEXT_VALUES_MAX_IDS + 1 }, (_, n) => id(n + 1));
    const fetchPage = vi.fn<TextValuesPageFetcher>();
    await expect(readTextValues(ids, PROPERTY, SPACE, fetchPage)).rejects.toThrow('Refusing');
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('propagates a failed read', async () => {
    const fetchPage = vi.fn<TextValuesPageFetcher>(async () => {
      throw new Error('graph down');
    });
    await expect(readTextValues([id(1)], PROPERTY, SPACE, fetchPage)).rejects.toThrow('graph down');
  });
});
