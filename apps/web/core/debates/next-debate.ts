import { normId } from '~/core/utils/norm-id';

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
  /** The still the app shows as the video's poster, when the debate has one. */
  keyFrame: string | null;
};

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
