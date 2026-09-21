import { normId } from '~/core/utils/norm-id';

/** How a comment's author stands to the proposal they are commenting on. */
export type ProposalCommentAttribution = {
  /**
   * `null` for someone who is neither an editor nor a member of the space.
   *
   * Reachable: nothing in the comment path checks membership — a comment is an entity published
   * into its author's own personal space — so anyone who can publish can comment on any proposal.
   */
  role: 'editor' | 'member' | null;
  /**
   * `null` means no vote has been cast, which is not the same as an absent attribution. An editor
   * who has not voted is the most consequential voice on an open proposal, and saying so is the
   * point of this whole join (GEO-2907).
   *
   * Only editors can cast one, but a member can still carry one: the roles are independent, so an
   * editor who voted and later lost editorship while keeping membership still has that vote on the
   * record.
   */
  vote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' | null;
  /**
   * Set where `vote: null` means "no vote was in the records we were given" rather than "no vote was
   * cast" — the two are the same thing only when the vote list is known to be complete. Nothing is
   * said about an editor's silence in that case, because their vote may simply be in a part of the
   * record we never saw, and "Not voted" about a person who voted is the one thing this badge must
   * not do.
   */
  voteUnknown?: boolean;
};

/**
 * Who is speaking on a proposal, keyed by personal space id.
 *
 * Comment authorship, vote records and space roles all identify a person the same way — by their
 * personal space — so the three join without any new identity plumbing: a comment entity lives in
 * its author's personal space, a proposal vote names its voter's, and a space's editors and members
 * are lists of them.
 *
 * Keyed canonically. The graph answers in bare hex, the proposal API in hyphenated UUIDs, and a raw
 * compare across that boundary silently answers "not an editor" — which is indistinguishable from a
 * correct answer and would quietly unbadge every editor on the page.
 *
 * The role lists are about the people who have commented — that is who the badges are for, and it is
 * the question the access layer can ask without being capped by the size of the space. Votes come in
 * whole, so the map also holds voters who have said nothing; those entries cost nothing and keep the
 * revoked-editor case below honest. An author missing from the map is someone the space has no record
 * of, which is the one case with nothing to say.
 */
export function proposalCommentAttribution({
  votes,
  editorSpaceIds,
  memberSpaceIds,
  votesComplete = true,
}: {
  /** Every vote on the proposal. `voterSpaceId` is the voter's personal space. */
  votes: ReadonlyArray<{ voterSpaceId: string; vote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' }>;
  editorSpaceIds: Iterable<string>;
  memberSpaceIds: Iterable<string>;
  /** Whether `votes` is all of them — see `voteUnknown`. */
  votesComplete?: boolean;
}): Map<string, ProposalCommentAttribution> {
  const voteBySpaceId = new Map<string, ProposalCommentAttribution['vote']>();
  for (const { voterSpaceId, vote } of votes) {
    voteBySpaceId.set(normId(voterSpaceId), vote);
  }

  const attribution = new Map<string, ProposalCommentAttribution>();

  // Members first, so an editor who is also a member overwrites with the stronger claim below.
  // Editor is the one that carries a vote, and it is what a reader needs to weigh the comment.
  for (const spaceId of memberSpaceIds) {
    const key = normId(spaceId);
    attribution.set(key, { role: 'member', vote: null });
  }

  for (const spaceId of editorSpaceIds) {
    const key = normId(spaceId);
    const vote = voteBySpaceId.get(key) ?? null;
    attribution.set(
      key,
      vote === null && !votesComplete ? { role: 'editor', vote, voteUnknown: true } : { role: 'editor', vote }
    );
  }

  // Every recorded vote lands on its voter's entry, whatever role they hold now. Editorship can be
  // revoked after a vote is cast and the vote stays on the record, so the voter may since have become
  // someone with no role at all — or, because the two roles are independent here, a plain member.
  // Skipping anyone who already had an entry dropped exactly that second case, which is the more
  // connected of the two: the stranger kept their vote and the member lost it.
  for (const [key, vote] of voteBySpaceId) {
    const existing = attribution.get(key);
    attribution.set(key, { role: existing?.role ?? null, vote });
  }

  return attribution;
}

/** What the badge reads, or `null` where there is nothing worth saying. */
function voteClause(vote: ProposalCommentAttribution['vote']): string | null {
  switch (vote) {
    case 'ACCEPT':
      return 'Accepted';
    case 'REJECT':
      return 'Rejected';
    case 'ABSTAIN':
      return 'Abstained';
    case null:
      return null;
  }
}

export function proposalAttributionLabel(attribution: ProposalCommentAttribution | undefined): string | null {
  if (!attribution) return null;

  const role = attribution.role === 'editor' ? 'Editor' : attribution.role === 'member' ? 'Member' : null;
  const vote = voteClause(attribution.vote);

  // A recorded vote is always said, whatever role its voter holds now. The rule that used to suppress
  // a member's vote clause was there because a member cannot cast one — but a vote on the record is
  // proof that this person did, back when they could, so the premise does not hold for them.
  //
  // `Member · Rejected` for a demoted editor was a product call rather than a mechanical one, since the
  // frame shows no such state; confirmed rather than assumed (GEO-2907 review). The alternatives were a
  // bare `Rejected`, which discards something true — they are a member — and `Former editor`, which the
  // join cannot support, since nothing distinguishes a demoted editor from any other member holding a
  // vote already cast.
  if (vote) return role ? `${role} · ${vote}` : vote;

  // No vote. Only an editor can still cast one, so only an editor's silence is worth reporting:
  // "Member · Not voted" would describe something that cannot happen.
  //
  // And only where the silence is real: with an incomplete vote list, "Not voted" would be a claim
  // about a person the records cannot support.
  if (attribution.role === 'editor') return attribution.voteUnknown ? 'Editor' : 'Editor · Not voted';

  return role;
}
