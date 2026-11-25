import { describe, expect, it } from 'vitest';

import {
  GRAPH_HISTORY_LIMIT,
  goBack,
  graphHistoryHref,
  historyFromUrl,
  recentre,
  sameHistory,
  startGraphHistory,
} from './history';

const id = (n: number) => n.toString(16).padStart(32, '0');

describe('graph history', () => {
  it('pushes the previous centre when re-centring', () => {
    const history = recentre(startGraphHistory(id(1)), id(2));
    expect(history).toEqual({ centreId: id(2), back: [id(1)] });
  });

  it('does nothing when the centre is clicked', () => {
    const history = startGraphHistory(id(1));
    expect(recentre(history, id(1))).toBe(history);
  });

  it('pops instead of pushing when going to the node just left, so Back never names the centre', () => {
    const history = recentre(recentre(startGraphHistory(id(1)), id(2)), id(1));
    expect(history).toEqual({ centreId: id(1), back: [] });
  });

  it('keeps the last eight steps', () => {
    let history = startGraphHistory(id(0));
    for (let step = 1; step <= GRAPH_HISTORY_LIMIT + 3; step++) history = recentre(history, id(step));
    expect(history.back).toHaveLength(GRAPH_HISTORY_LIMIT);
    expect(history.back.at(-1)).toBe(id(GRAPH_HISTORY_LIMIT + 2));
  });

  it('goes back one step, and stays put with nothing to go back to', () => {
    const history = recentre(recentre(startGraphHistory(id(1)), id(2)), id(3));
    expect(goBack(history)).toEqual({ centreId: id(2), back: [id(1)] });
    const start = startGraphHistory(id(1));
    expect(goBack(start)).toBe(start);
  });

  it('normalises dashed ids', () => {
    expect(startGraphHistory('00000000-0000-0000-0000-000000000001').centreId).toBe(id(1));
  });
});

describe('graph history in the URL', () => {
  it('reads the centre from the path and the back stack from `trail`', () => {
    const params = new URLSearchParams({ topic: id(9), trail: `${id(1)}, junk ,${id(2)}` });
    expect(historyFromUrl(id(3), params)).toEqual({ centreId: id(3), back: [id(1), id(2)] });
  });

  it('drops a trail that ends on the centre, and keeps the last eight', () => {
    expect(historyFromUrl(id(2), new URLSearchParams({ trail: `${id(1)},${id(2)}` })).back).toEqual([id(1)]);
    const long = Array.from({ length: 12 }, (_, index) => id(index + 10)).join(',');
    expect(historyFromUrl(id(1), new URLSearchParams({ trail: long })).back).toHaveLength(GRAPH_HISTORY_LIMIT);
  });

  it('writes the centre and trail and keeps every other param', () => {
    const params = new URLSearchParams({ topic: id(9), space: id(8), spaces: id(7) });
    const href = graphHistoryHref({ centreId: id(3), back: [id(1), id(2)] }, params);
    const url = new URL(href, 'https://geo.test');
    expect(url.pathname).toBe(`/explore/graph/${id(3)}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      topic: id(9),
      space: id(8),
      spaces: id(7),
      trail: `${id(1)},${id(2)}`,
    });
    expect(graphHistoryHref(startGraphHistory(id(3)), new URLSearchParams({ trail: id(1) }))).toBe(
      `/explore/graph/${id(3)}`
    );
  });

  it('leaves a shared link’s chip behind on a hop, but keeps a kinds filter', () => {
    const chip = new URL(
      graphHistoryHref(
        recentre(startGraphHistory(id(1)), id(2)),
        new URLSearchParams({ topic: id(9), kinds: 'claim' })
      ),
      'https://geo.test'
    );
    expect(chip.searchParams.get('kinds')).toBeNull();
    expect(chip.searchParams.get('topic')).toBe(id(9));
    const narrowed = new URL(
      graphHistoryHref(startGraphHistory(id(2)), new URLSearchParams({ topic: id(9), kinds: 'ent,claim' })),
      'https://geo.test'
    );
    expect(narrowed.searchParams.get('kinds')).toBe('ent,claim');
  });

  it('round-trips through the URL', () => {
    const history = recentre(recentre(startGraphHistory(id(1)), id(2)), id(3));
    const url = new URL(graphHistoryHref(history, new URLSearchParams()), 'https://geo.test');
    expect(sameHistory(historyFromUrl(url.pathname.split('/').at(-1)!, url.searchParams), history)).toBe(true);
  });
});
