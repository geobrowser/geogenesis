import { describe, expect, it, vi } from 'vitest';

import { collectCursorPages, createCursorPageCheckpoint } from './collect-cursor-pages';

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

  it('resumes at the failed cursor without replaying successful pages', async () => {
    const checkpoint = createCursorPageCheckpoint<string>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a'], endCursor: 'cursor-a', hasNextPage: true })
      .mockRejectedValueOnce(new Error('page two failed'))
      .mockResolvedValueOnce({ items: ['b'], endCursor: null, hasNextPage: false });

    await expect(collectCursorPages(fetchPage, checkpoint)).rejects.toThrow('page two failed');
    await expect(collectCursorPages(fetchPage, checkpoint)).resolves.toEqual(['a', 'b']);
    expect(fetchPage.mock.calls).toEqual([[undefined], ['cursor-a'], ['cursor-a']]);
  });

  it('does not checkpoint a page whose cursor contract is invalid', async () => {
    const checkpoint = createCursorPageCheckpoint<string>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ['invalid'], endCursor: null, hasNextPage: true })
      .mockResolvedValueOnce({ items: ['valid'], endCursor: null, hasNextPage: false });

    await expect(collectCursorPages(fetchPage, checkpoint)).rejects.toThrow('no end cursor');
    await expect(collectCursorPages(fetchPage, checkpoint)).resolves.toEqual(['valid']);
  });
});
