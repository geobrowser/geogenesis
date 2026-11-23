import { normId } from '~/core/utils/norm-id';

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
