import { normId } from '~/core/utils/norm-id';

import { parseGraphFilterOverrides } from './graph-filter';

/** The back stack's URL param: previous centres, oldest first. */
export const GRAPH_TRAIL_PARAM = 'trail';

const HEX_ID = /^[0-9a-f]{32}$/;

export const GRAPH_HISTORY_LIMIT = 8;

export type GraphHistory = {
  centreId: string;
  /** Previous centres, oldest first. */
  back: string[];
};

export function startGraphHistory(centreId: string): GraphHistory {
  return { centreId: normId(centreId), back: [] };
}

/**
 * Re-centre on `entityId`. The current centre is a no-op, and the node we just came from pops
 * instead of pushing, so "Back to X" never names the node you are on.
 */
export function recentre(history: GraphHistory, entityId: string): GraphHistory {
  const id = normId(entityId);
  if (id === history.centreId) return history;
  if (history.back.at(-1) === id) return { centreId: id, back: history.back.slice(0, -1) };
  return { centreId: id, back: [...history.back, history.centreId].slice(-GRAPH_HISTORY_LIMIT) };
}

export function goBack(history: GraphHistory): GraphHistory {
  const previous = history.back.at(-1);
  if (!previous) return history;
  return { centreId: previous, back: history.back.slice(0, -1) };
}

export function sameHistory(a: GraphHistory, b: GraphHistory): boolean {
  return a.centreId === b.centreId && a.back.join(',') === b.back.join(',');
}

/** The history a URL describes: the path's centre and its `trail`. */
export function historyFromUrl(centreId: string, params: Pick<URLSearchParams, 'get'>): GraphHistory {
  const centre = normId(centreId);
  const back = (params.get(GRAPH_TRAIL_PARAM) ?? '')
    .split(',')
    .map(part => normId(part.trim()))
    .filter(id => HEX_ID.test(id));
  while (back.at(-1) === centre) back.pop();
  return { centreId: centre, back: back.slice(-GRAPH_HISTORY_LIMIT) };
}

/**
 * The URL for `history`, keeping every other param (topic, space, filters) as it is. A one-kind
 * `kinds` is the chip a shared link opened on, read once: hops leave it behind, so a reload or a
 * copied address doesn't bring back a chip the viewer has since left.
 */
export function graphHistoryHref(history: GraphHistory, params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  if (parseGraphFilterOverrides(next).chip) next.delete('kinds');
  if (history.back.length > 0) next.set(GRAPH_TRAIL_PARAM, history.back.join(','));
  else next.delete(GRAPH_TRAIL_PARAM);
  const query = next.toString();
  return `/explore/graph/${history.centreId}${query ? `?${query}` : ''}`;
}
