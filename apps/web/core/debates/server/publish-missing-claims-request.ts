import { normId } from '~/core/utils/norm-id';

import { readEnv } from './acceptor-config';
import type { BlockTextMode } from './publish-missing-debate-claims';

/** A dry run only reads, so it takes a backfill-sized batch. */
export const MAX_DRY_RUN_DEBATES = 25;
/** An apply signs one DAO proposal, vote and execute per debate: two fit well inside the route's 300 s. */
export const MAX_APPLY_DEBATES = 2;

const DEBATE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `spaceId` may run the late claims publish (GEO-3635), which signs as the debate acceptor:
 * on `DEBATE_ACCEPTOR_ADMIN_SPACE_IDS`, a comma-separated list of personal space ids. Unset is nobody.
 */
export function isAcceptorAdmin(spaceId: string): boolean {
  const allowed = readEnv('DEBATE_ACCEPTOR_ADMIN_SPACE_IDS')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(normId);
  return allowed.includes(normId(spaceId));
}

export type PublishMissingClaimsBody = {
  debateIds: string[];
  apply: boolean;
  expect: Record<string, string>;
  blockText: BlockTextMode;
  reason: string;
};

export function parsePublishMissingClaimsBody(raw: unknown): PublishMissingClaimsBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' };
  const { debateIds, apply, expect, blockText, reason } = raw as Record<string, unknown>;
  if (!Array.isArray(debateIds) || debateIds.length === 0) return { error: 'debate_ids_required' };
  const ids: string[] = [];
  for (const id of debateIds) {
    if (typeof id !== 'string' || !DEBATE_ID.test(id.trim())) return { error: 'invalid_debate_id' };
    const lower = id.trim().toLowerCase();
    if (!ids.includes(lower)) ids.push(lower);
  }
  if (apply !== undefined && typeof apply !== 'boolean') return { error: 'invalid_apply' };
  const applying = apply === true;
  if (ids.length > (applying ? MAX_APPLY_DEBATES : MAX_DRY_RUN_DEBATES)) return { error: 'too_many_debates' };
  if (typeof reason !== 'string' || reason.trim().length === 0) return { error: 'reason_required' };
  if (blockText !== undefined && blockText !== 'keep' && blockText !== 'rewrite')
    return { error: 'invalid_block_text' };
  const expected: Record<string, string> = {};
  if (expect !== undefined) {
    if (!expect || typeof expect !== 'object' || Array.isArray(expect)) return { error: 'invalid_expect' };
    for (const [id, fingerprint] of Object.entries(expect as Record<string, unknown>)) {
      if (typeof fingerprint !== 'string') return { error: 'invalid_expect' };
      expected[id.trim().toLowerCase()] = fingerprint;
    }
  }
  if (applying && ids.some(id => !expected[id])) return { error: 'expect_required' };
  return { debateIds: ids, apply: applying, expect: expected, blockText: blockText ?? 'keep', reason: reason.trim() };
}
