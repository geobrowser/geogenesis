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
   * Only editors vote, so this is always `null` for a member.
   */
  vote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' | null;
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
 * Everyone known is in the map, not only the people who have commented: the caller has the space's
 * roles and the proposal's votes, and does not know who will comment next. An author missing from it
 * is someone the space has no record of, which is the one case with nothing to say.
 */
export function proposalCommentAttribution({
  votes,
  editorSpaceIds,
  memberSpaceIds,
}: {
  /** Every vote on the proposal. `voterSpaceId` is the voter's personal space. */
  votes: ReadonlyArray<{ voterSpaceId: string; vote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' }>;
  editorSpaceIds: Iterable<string>;
  memberSpaceIds: Iterable<string>;
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
    attribution.set(key, { role: 'editor', vote: voteBySpaceId.get(key) ?? null });
  }

  // A vote from someone the role lists do not cover. Editorship can be revoked after a vote is
  // cast, and the vote stays on the record — so the vote is reported without claiming a role for
  // them, rather than dropped for want of one.
  for (const [key, vote] of voteBySpaceId) {
    if (attribution.has(key)) continue;
    attribution.set(key, { role: null, vote });
  }

  return attribution;
}

/** What the badge reads, or `null` where there is nothing worth saying. */
export function proposalAttributionLabel(attribution: ProposalCommentAttribution | undefined): string | null {
  if (!attribution) return null;

  const role = attribution.role === 'editor' ? 'Editor' : attribution.role === 'member' ? 'Member' : null;

  // Only editors vote, so a vote clause on a member would be describing something that cannot
  // happen. A member's standing is the whole of what there is to say about them.
  if (attribution.role === 'member') return role;

  switch (attribution.vote) {
    case 'ACCEPT':
      return role ? `${role} · Accepted` : 'Accepted';
    case 'REJECT':
      return role ? `${role} · Rejected` : 'Rejected';
    case 'ABSTAIN':
      return role ? `${role} · Abstained` : 'Abstained';
    // Said out loud rather than left blank. An editor who has not voted looks identical to a
    // passer-by otherwise, and on an open proposal they are the opposite of one.
    case null:
      return role ? `${role} · Not voted` : null;
  }
}
