import { describe, expect, it, vi } from 'vitest';

import { collectCursorPages } from './collect-cursor-pages';

describe('collectCursorPages', () => {
  it('collects every page in cursor order', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a', 'b'], endCursor: 'cursor-b', hasNextPage: true })
      .mockResolvedValueOnce({ items: ['c'], endCursor: 'cursor-c', hasNextPage: true })
      .mockResolvedValueOnce({ items: ['d'], endCursor: null, hasNextPage: false });

    await expect(collectCursorPages(fetchPage)).resolves.toEqual(['a', 'b', 'c', 'd']);
    expect(fetchPage.mock.calls).toEqual([[undefined], ['cursor-b'], ['cursor-c']]);
  });

  it('rejects a next page without a usable cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: ['a'], endCursor: null, hasNextPage: true });

    await expect(collectCursorPages(fetchPage)).rejects.toThrow('no end cursor');
  });

  it('rejects a repeated cursor instead of looping forever', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: ['a'], endCursor: 'same', hasNextPage: true });

    await expect(collectCursorPages(fetchPage)).rejects.toThrow('repeated its end cursor');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
