import { describe, expect, it } from 'vitest';

import { GRAPH_HISTORY_LIMIT, goBack, recentre, startGraphHistory } from './history';

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
