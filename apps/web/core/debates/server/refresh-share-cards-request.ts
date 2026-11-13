import { ID } from '~/core/id';

/**
 * Debates per request, dry run or apply. An apply renders and pins each card (a few seconds apiece,
 * four at a time) and then submits one edit per space; this many leave room for both inside the
 * route's 300 s, and whatever the deadline cuts off comes back as `unprocessed`.
 */
export const MAX_SHARE_CARD_DEBATES = 40;

export type RefreshShareCardsBody = { debateIds: string[]; apply: boolean; reason: string };

/**
 * `{ debateIds, apply?, reason }`, as the late claims route takes it. Ids may be dashed or dashless
 * (graph listings are dashless); they come back dashed and lower-case, as geo-chat names debates.
 */
export function parseRefreshShareCardsBody(raw: unknown): RefreshShareCardsBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' };
  const { debateIds, apply, reason } = raw as Record<string, unknown>;
  if (!Array.isArray(debateIds) || debateIds.length === 0) return { error: 'debate_ids_required' };
  const ids: string[] = [];
  for (const id of debateIds) {
    if (typeof id !== 'string') return { error: 'invalid_debate_id' };
    const hex = ID.uuidToHex(id.trim());
    const dashed = /^[0-9a-f]{8}(-?)[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{12}$/i.test(id.trim());
    if (!dashed || !/^[0-9a-f]{32}$/.test(hex)) return { error: 'invalid_debate_id' };
    const uuid = ID.hexToUuid(hex);
    if (!ids.includes(uuid)) ids.push(uuid);
  }
  if (ids.length > MAX_SHARE_CARD_DEBATES) return { error: 'too_many_debates' };
  if (apply !== undefined && typeof apply !== 'boolean') return { error: 'invalid_apply' };
  if (typeof reason !== 'string' || reason.trim().length === 0) return { error: 'reason_required' };
  return { debateIds: ids, apply: apply === true, reason: reason.trim() };
}
