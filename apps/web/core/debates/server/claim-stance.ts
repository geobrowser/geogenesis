import { uuidToHex } from '~/core/id/normalize';

import { CLAIM_STANCE_PROPERTY_IDS, type DebateClaimInput } from '../debate-publish-draft';
import { type RelationTargetsPageFetcher, collectRelationTargets } from './relation-targets';

/**
 * GEO-3142: makes "one stance relation per (claim, motion)" hold across publishes, not only
 * within one draft.
 *
 * The draft writes a Supports / Opposes / Addresses relation from every extracted claim to the
 * debate's motion. A minted claim is new, so it cannot already have one. A claim that may already
 * exist on the graph can: a reused entity (`existingClaimEntityId`) that an earlier debate on the
 * same motion — or the 2 Oct backfill — already linked, and a D1 stable id (`stableEntityId`) if
 * the claim was published before this sweep reached the debate. Those are looked up in one read,
 * and any already linked to the motion in this space by any of the three relations keeps that
 * relation untouched: its stance here is cleared, so the draft writes nothing for it.
 *
 * Never throws. If the read fails, the stance of every looked-up claim is cleared (and logged):
 * a missing relation can be backfilled later, a second one is the failure this exists to prevent.
 * Freshly minted claims keep theirs either way.
 */
export async function applyClaimStancePolicy(
  claims: DebateClaimInput[],
  spaceId: string,
  motionClaimEntityId: string,
  options: { debateId?: string; fetchRelationPage?: RelationTargetsPageFetcher } = {}
): Promise<DebateClaimInput[]> {
  const knownId = (claim: DebateClaimInput) => claim.existingClaimEntityId || claim.stableEntityId || null;
  const ids = [
    ...new Set(
      claims.flatMap(claim => {
        const id = claim.stance ? knownId(claim) : null;
        return id ? [uuidToHex(id)] : [];
      })
    ),
  ];
  if (claims.length === 0) return claims;

  const linked =
    ids.length > 0 ? await readLinkedToMotion(ids, spaceId, motionClaimEntityId, options) : new Set<string>();

  if (linked.size > 0) {
    console.log('[debate-acceptor] claims already carry a stance toward the motion; keeping theirs', {
      debateId: options.debateId,
      count: linked.size,
    });
  }
  const result = claims.map(claim => {
    const id = knownId(claim);
    return claim.stance && id && linked.has(uuidToHex(id)) ? { ...claim, stance: null } : claim;
  });
  // A zero here while claims are being published means the verdicts went missing upstream (an
  // older extraction-api, or a renamed field) — the same blind spot the reuse policy counts.
  const counts = { supports: 0, opposes: 0, addresses: 0, none: 0 };
  for (const claim of result) counts[claim.stance ?? 'none'] += 1;
  console.log('[debate-acceptor] claim stances decided', { debateId: options.debateId, ...counts });
  return result;
}

/** Of `ids`, those already related to the motion in `spaceId` by any stance relation. */
async function readLinkedToMotion(
  ids: string[],
  spaceId: string,
  motionClaimEntityId: string,
  options: { debateId?: string; fetchRelationPage?: RelationTargetsPageFetcher }
): Promise<Set<string>> {
  try {
    const relations = await collectRelationTargets(
      { fromEntityIds: ids, typeIds: Object.values(CLAIM_STANCE_PROPERTY_IDS), spaceId },
      options.fetchRelationPage
    );
    const motionKey = uuidToHex(motionClaimEntityId);
    return new Set(
      relations
        .filter(relation => uuidToHex(relation.toEntityId) === motionKey)
        .map(relation => uuidToHex(relation.fromEntityId))
    );
  } catch (error) {
    console.warn('[debate-acceptor] could not read existing stance relations; publishing those claims without one', {
      debateId: options.debateId,
      claims: ids.length,
      error,
    });
    return new Set(ids);
  }
}
