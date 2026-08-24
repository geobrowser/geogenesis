import type { SpaceGovernanceType } from '~/core/types';

import { normId } from '~/core/utils/norm-id';

/**
 * Whether a finished debate on a claim in this space could ever reach the knowledge graph.
 *
 * A debate is published by the acceptor service account, into the *claim's home space*
 * (`publishDebateAsAcceptor`), and publishing needs editor rights there — a member can propose but
 * not vote and execute, so anything else reverts on-chain as `CanNotExecute`. `getSpaceAccess`
 * grants a personal space's editor rights to its owner and to nobody else, and the acceptor is
 * never a debater's own space. So a claim whose home space is personal cannot host a debate: the
 * pair would record one, the sweep would log `not_editor`, and nothing would ever be published.
 *
 * Offering such a claim in the picker is worse than leaving it out. Both sides spend a debate on it
 * and the result quietly evaporates.
 *
 * This is a *sufficient* test, not a complete one: a DAO space the acceptor does not edit fails the
 * same way, and this cannot tell — `DEBATE_ACCEPTOR_SPACE_ID` is server-only, deliberately, and
 * editorship is a per-space lookup against it. Closing that gap belongs in geo-chat, next to the
 * `readiness_disabled_reason` it already computes per claim. The personal-space case is the one
 * that is both decidable here and the one curators keep hitting, since a personal space is where a
 * debater's own claims are published by default.
 */
export function isDebatePublishableSpace(space: { type: SpaceGovernanceType } | null | undefined): boolean {
  // Unresolved reads as publishable, matching how the claim-space allowlist treats its own
  // half-built state: too wide beats a list that never fills, and the lookup lands in a beat.
  if (!space) return true;
  return space.type !== 'PERSONAL';
}

/**
 * A predicate over claim home-space ids, given whatever `useSpacesByIds` has resolved.
 *
 * Ids are normalized on the way in: a claim row carries the spelling the graph was queried with,
 * while the space lookup keys on the spelling the API answered with, and the two differ by dashes.
 */
export function debatePublishableSpacePredicate(
  spacesById: Map<string, { type: SpaceGovernanceType }>
): (spaceId: string | null | undefined) => boolean {
  const byNormalizedId = new Map<string, { type: SpaceGovernanceType }>();
  for (const [id, space] of spacesById) byNormalizedId.set(normId(id), space);

  return spaceId => {
    if (!spaceId) return false;
    return isDebatePublishableSpace(byNormalizedId.get(normId(spaceId)));
  };
}
