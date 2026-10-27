import { describe, expect, it, vi } from 'vitest';

import { leadWithPlayableDebate } from './lead-with-playable-debate';

type Row = { id: string; debate: boolean };

const row = (id: string, debate = false): Row => ({ id, debate });
const ids = (rows: Row[]) => rows.map(r => r.id);

const lead = (rows: Row[], playable: Record<string, boolean | 'reject'>, options = {}) =>
  leadWithPlayableDebate(rows, {
    isDebate: r => r.debate,
    isPlayable: async r => {
      const verdict = playable[r.id];
      if (verdict === 'reject') throw new Error('geo-chat unavailable');
      return verdict ?? false;
    },
    ...options,
  });

// GEO-3070's acceptance criteria, one per test.
describe('leadWithPlayableDebate', () => {
  it('opens on the highest-ranked playable debate, and shows it only once', async () => {
    const rows = [row('c1'), row('n1'), row('d1', true), row('c2'), row('d2', true)];

    const out = await lead(rows, { d1: true, d2: true });

    expect(ids(out)).toEqual(['d1', 'c1', 'n1', 'c2', 'd2']);
    expect(new Set(ids(out)).size).toBe(rows.length);
  });

  it('never leads with a debate whose video is not ready', async () => {
    const rows = [row('c1'), row('d1', true), row('d2', true)];

    expect(ids(await lead(rows, { d1: false, d2: true }))).toEqual(['d2', 'c1', 'd1']);
  });

  it('treats a failed check as not playable', async () => {
    const rows = [row('c1'), row('d1', true), row('d2', true)];

    expect(ids(await lead(rows, { d1: 'reject', d2: true }))).toEqual(['d2', 'c1', 'd1']);
  });

  it('serves the feed as ranked when no debate plays, with nothing inserted at the top', async () => {
    const rows = [row('c1'), row('d1', true), row('n1')];

    expect(ids(await lead(rows, { d1: false }))).toEqual(['c1', 'd1', 'n1']);
  });

  it('asks nothing when the window holds no debate', async () => {
    const isPlayable = vi.fn(async () => true);
    const rows = [row('c1'), row('n1')];

    const out = await leadWithPlayableDebate(rows, { isDebate: r => r.debate, isPlayable });

    expect(ids(out)).toEqual(['c1', 'n1']);
    expect(isPlayable).not.toHaveBeenCalled();
  });

  it('leaves the order alone when a playable debate already leads', async () => {
    const rows = [row('d1', true), row('c1')];

    expect(ids(await lead(rows, { d1: true }))).toEqual(['d1', 'c1']);
  });

  it('checks only the top few debates', async () => {
    const isPlayable = vi.fn(async (r: Row) => r.id === 'd3');
    const rows = [row('d1', true), row('d2', true), row('d3', true)];

    const out = await leadWithPlayableDebate(rows, { isDebate: r => r.debate, isPlayable, candidates: 2 });

    expect(isPlayable).toHaveBeenCalledTimes(2);
    expect(ids(out)).toEqual(['d1', 'd2', 'd3']);
  });

  it('gives up and serves the ranked order when geo-chat is too slow', async () => {
    vi.useFakeTimers();
    try {
      const rows = [row('c1'), row('d1', true)];
      const pending = leadWithPlayableDebate(rows, {
        isDebate: r => r.debate,
        isPlayable: (_r, signal) =>
          new Promise<boolean>((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
        timeoutMs: 100,
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(ids(await pending)).toEqual(['c1', 'd1']);
    } finally {
      vi.useRealTimers();
    }
  });
});
