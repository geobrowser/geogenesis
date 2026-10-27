import { dashlessId } from '~/core/debates/api';

import type { SpaceCallSummary, SpaceCallsResponse } from './api';

/** A `debate.space_calls_changed` row: a live call whose people or hosts changed (GEO-3419). */
export type SpaceCallPatch = { status: string; as_of: string; call: SpaceCallSummary };

/** The event's `space_call`, or `null` when it has none (refetch the list) or it is malformed. */
export function parseSpaceCallPatch(value: unknown): SpaceCallPatch | null {
  if (!value || typeof value !== 'object') return null;
  const { status, as_of, call } = value as Record<string, unknown>;
  if (typeof status !== 'string' || typeof as_of !== 'string' || !call || typeof call !== 'object') return null;
  const row = call as Partial<SpaceCallSummary>;
  if (typeof row.call_id !== 'string' || typeof row.as_of !== 'string') return null;
  if (!Array.isArray(row.hosts) || !Array.isArray(row.avatars) || typeof row.headcount !== 'number') return null;
  return { status, as_of, call: row as SpaceCallSummary };
}

/** `a` is later than `b`. Stamps carry microseconds, past what `Date.parse` keeps. */
function later(a: string, b: string) {
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (Number.isNaN(at) || Number.isNaN(bt) || at === bt) return a > b;
  return at > bt;
}

/** Patches a row already listed, when the patch is newer. Never adds one: a new call comes by refetch. */
export function withSpaceCallPatch(list: SpaceCallsResponse, patch: SpaceCallPatch): SpaceCallsResponse {
  const id = dashlessId(patch.call.call_id);
  let changed = false;
  const calls = list.calls.map(row => {
    if (dashlessId(row.call_id) !== id || !later(patch.call.as_of, row.as_of)) return row;
    changed = true;
    return patch.call;
  });
  return changed ? { ...list, calls } : list;
}
