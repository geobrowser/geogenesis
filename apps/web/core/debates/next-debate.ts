import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Entity, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_VIDEOS_PROPERTY_ID } from './ontology';

/**
 * Which debate a finished one points the viewer to next. Pure, so every rule below is tested without
 * a query.
 */

/** A published debate in the space, as the picker needs it. Ids in graph spelling. */
export type NextDebateCandidate = {
  debateId: string;
  claimId: string;
  claimName: string;
  /** The claim's topics *in this space* — topics are assigned per space. */
  topicIds: string[];
};

/**
 * A space's Debate entities as the picker's candidates, given their claims.
 *
 * Every relation is read in this space. Topics are assigned per space, and a topic this claim only
 * carries elsewhere would make "related" mean something the claim page's gallery doesn't.
 *
 * Dropped:
 * - a debate with no video, which there is nothing to watch on — the feeds keep the same rule
 *   (`isWatchableDebate`), and a suggestion that opens onto a debate that can't play is worse than
 *   none;
 * - a debate whose claim hasn't resolved to a name, which the card would have nothing to title with.
 *   Pass no claims to get none at all — {@link debateClaimIds} is what asks which claims to fetch.
 */
export function nextDebateCandidates(debates: Entity[], claims: Entity[], spaceId: string): NextDebateCandidate[] {
  const claimsById = new Map(claims.map(claim => [normId(claim.id), claim]));

  return debates.flatMap(debate => {
    const relations = inSpace(debate.relations, spaceId);
    if (Entities.relationTargets(relations, DEBATE_VIDEOS_PROPERTY_ID).length === 0) return [];

    const claimId = debateClaimId(debate, spaceId);
    const claim = claimId ? claimsById.get(claimId) : undefined;
    if (!claimId || !claim?.name) return [];

    return [
      {
        debateId: normId(debate.id),
        claimId,
        claimName: claim.name,
        topicIds: Entities.relationTargets(inSpace(claim.relations, spaceId), TOPICS_PROPERTY_ID).map(normId),
      },
    ];
  });
}

/** The claims a space's debates argued — what {@link nextDebateCandidates} needs fetched. */
export function debateClaimIds(debates: Entity[], spaceId: string): string[] {
  return [...new Set(debates.flatMap(debate => debateClaimId(debate, spaceId) ?? []))];
}

/** A Debate carries exactly one `Claims` relation — the motion it argued. */
function debateClaimId(debate: Entity, spaceId: string): string | null {
  const id = Entities.relationTargets(inSpace(debate.relations, spaceId), DEBATE_CLAIMS_PROPERTY_ID)[0];
  return id ? normId(id) : null;
}

function inSpace(relations: Relation[], spaceId: string): Relation[] {
  return relations.filter(relation => normId(relation.spaceId) === spaceId);
}

export type NextDebatePick = {
  candidate: NextDebateCandidate;
  /** Whether it argues a related claim, or is only the next debate in the space. */
  related: boolean;
};

/**
 * The best-ranked debate the viewer has not watched, preferring one about a related claim.
 *
 * "Related" is the relation `relatedClaimsWhere` defines for the claim page's gallery and the
 * debate-again picker: another claim carrying one of this claim's topics in the same space. It is
 * applied here to rows already in hand rather than as a query clause, because the space's debates
 * are one small request that answers both tiers at once.
 *
 * Skipped outright:
 * - the debate that just ended, and anything this browser has watched to the end;
 * - any debate on the claim that was just debated — the card has just asked where the viewer stands
 *   on it, and offering the same question again reads as the card repeating itself.
 *
 * Ordered by the space's Best ranking, the same order the debates feed plays them in. A debate the
 * ranking has not covered goes after every ranked one, in the order the candidates came.
 *
 * Null when nothing is left: a viewer who has watched every debate in the space is better served by
 * no suggestion than by one they have seen.
 */
export function pickNextDebate({
  candidates,
  currentDebateId,
  currentClaimId,
  rankByDebateId,
  watchedDebateIds,
}: {
  candidates: NextDebateCandidate[];
  currentDebateId: string;
  currentClaimId: string;
  rankByDebateId: ReadonlyMap<string, number>;
  watchedDebateIds: ReadonlySet<string>;
}): NextDebatePick | null {
  const debateId = normId(currentDebateId);
  const claimId = normId(currentClaimId);

  // The current claim's topics come off the same rows: its debate is one of the space's debates.
  // If it isn't there yet (indexing lag), nothing counts as related and the space tier still works.
  const currentTopics = new Set(candidates.find(candidate => normId(candidate.claimId) === claimId)?.topicIds ?? []);

  const rankOf = (candidate: NextDebateCandidate) =>
    rankByDebateId.get(normId(candidate.debateId)) ?? Number.POSITIVE_INFINITY;

  const eligible = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => {
      const id = normId(candidate.debateId);
      return id !== debateId && !watchedDebateIds.has(id) && normId(candidate.claimId) !== claimId;
    })
    .sort((a, z) => rankOf(a.candidate) - rankOf(z.candidate) || a.index - z.index)
    .map(({ candidate }) => candidate);

  const related = eligible.find(candidate => candidate.topicIds.some(topicId => currentTopics.has(topicId)));
  if (related) return { candidate: related, related: true };

  const next = eligible[0];
  return next ? { candidate: next, related: false } : null;
}
