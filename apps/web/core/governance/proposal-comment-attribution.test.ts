import { describe, expect, it } from 'vitest';

import { proposalAttributionLabel, proposalCommentAttribution } from './proposal-comment-attribution';

/** The same personal space, in the two spellings the sources answer with. */
const EDITOR_HEX = '4cd9cca5530b69056aead853c8088e7e';
const EDITOR_UUID = '4cd9cca5-530b-6905-6aea-d853c8088e7e';
const MEMBER_HEX = 'cc0bf85a27c217d75993bc785a15b198';
const OTHER_HEX = 'fcf1ddb14f461bf747bbf148254935ed';

function attribution(
  overrides: Partial<Parameters<typeof proposalCommentAttribution>[0]> = {}
): ReturnType<typeof proposalCommentAttribution> {
  return proposalCommentAttribution({ votes: [], editorSpaceIds: [], memberSpaceIds: [], ...overrides });
}

describe('who is speaking', () => {
  it('reports an editor and how they voted', () => {
    const map = attribution({
      editorSpaceIds: [EDITOR_HEX],
      votes: [{ voterSpaceId: EDITOR_HEX, vote: 'REJECT' }],
    });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'editor', vote: 'REJECT' });
  });

  /**
   * The case the whole join exists for. An editor arguing before they commit is the most
   * consequential voice on an open proposal, and left blank they read like a passer-by.
   */
  it('reports an editor who has not voted', () => {
    const map = attribution({ editorSpaceIds: [EDITOR_HEX] });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'editor', vote: null });
    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Editor · Not voted');
  });

  it('reports a member, with no vote clause', () => {
    const map = attribution({ memberSpaceIds: [MEMBER_HEX] });

    expect(map.get(MEMBER_HEX)).toEqual({ role: 'member', vote: null });
    // Members cannot vote, so "Member · Not voted" would describe something that cannot happen.
    expect(proposalAttributionLabel(map.get(MEMBER_HEX))).toBe('Member');
  });

  // Editor is the stronger claim and the one that carries a vote, so it wins.
  it('prefers editor over member for someone who is both', () => {
    const map = attribution({
      editorSpaceIds: [EDITOR_HEX],
      memberSpaceIds: [EDITOR_HEX],
      votes: [{ voterSpaceId: EDITOR_HEX, vote: 'ACCEPT' }],
    });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'editor', vote: 'ACCEPT' });
    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Editor · Accepted');
  });

  /**
   * The graph answers in bare hex and the proposal API in hyphenated UUIDs. A raw compare across
   * that boundary answers "not an editor", which is indistinguishable from a correct answer — so it
   * would quietly unbadge every editor on the page rather than fail.
   */
  it('joins the two spellings of the same space', () => {
    const map = attribution({
      editorSpaceIds: [EDITOR_HEX],
      votes: [{ voterSpaceId: EDITOR_UUID, vote: 'REJECT' }],
    });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'editor', vote: 'REJECT' });
  });

  /**
   * Editorship can be revoked after a vote is cast, and the vote stays on the record. Dropping it
   * for want of a role would hide a vote that was counted.
   */
  it('keeps a vote from someone the role lists no longer cover', () => {
    const map = attribution({ votes: [{ voterSpaceId: OTHER_HEX, vote: 'ABSTAIN' }] });

    expect(map.get(OTHER_HEX)).toEqual({ role: null, vote: 'ABSTAIN' });
    expect(proposalAttributionLabel(map.get(OTHER_HEX))).toBe('Abstained');
  });

  /**
   * The same revocation, one step less severe: editorship gone, membership intact. Editor and member
   * are independent here, so this is the ordinary shape of a demotion — and it used to be the case
   * that lost the vote, because the member loop had already claimed the entry. The stranger above kept
   * their vote while the member lost theirs, which is backwards.
   */
  it('keeps a vote from a former editor who is still a member', () => {
    const map = attribution({
      memberSpaceIds: [EDITOR_HEX],
      votes: [{ voterSpaceId: EDITOR_HEX, vote: 'REJECT' }],
    });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'member', vote: 'REJECT' });
    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Member · Rejected');
  });

  /**
   * And a member who never voted still says nothing about voting. The suppression rule was right for
   * them — they cannot cast one — it was only wrong for a member holding a vote already cast.
   */
  it('still says nothing about voting for a member with no vote', () => {
    const map = attribution({ memberSpaceIds: [MEMBER_HEX] });

    expect(proposalAttributionLabel(map.get(MEMBER_HEX))).toBe('Member');
  });

  /**
   * Nothing in the comment path checks membership — a comment is published into its author's own
   * personal space — so a commenter the space has no record of is reachable today.
   */
  it('says nothing about someone the space has no record of', () => {
    const map = attribution({ editorSpaceIds: [EDITOR_HEX] });

    expect(map.get(OTHER_HEX)).toBeUndefined();
    expect(proposalAttributionLabel(map.get(OTHER_HEX))).toBeNull();
  });

  /**
   * "Not voted" is the one claim that rests on a vote being *absent*, so it needs the record to be
   * whole. Given a partial one, the badge says what it knows — that they are an editor — and stops.
   */
  it('does not call an editor unvoted when the vote records are incomplete', () => {
    const map = attribution({ editorSpaceIds: [EDITOR_HEX], votesComplete: false });

    expect(map.get(EDITOR_HEX)).toEqual({ role: 'editor', vote: null, voteUnknown: true });
    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Editor');
  });

  it('still reports a vote it did see from an incomplete record', () => {
    const map = attribution({
      editorSpaceIds: [EDITOR_HEX],
      votes: [{ voterSpaceId: EDITOR_HEX, vote: 'REJECT' }],
      votesComplete: false,
    });

    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Editor · Rejected');
  });

  // Abstaining is a deliberate act and not silence, so it is not folded in with "not voted".
  it('distinguishes abstaining from not having voted', () => {
    const map = attribution({
      editorSpaceIds: [EDITOR_HEX, MEMBER_HEX],
      votes: [{ voterSpaceId: EDITOR_HEX, vote: 'ABSTAIN' }],
    });

    expect(proposalAttributionLabel(map.get(EDITOR_HEX))).toBe('Editor · Abstained');
    expect(proposalAttributionLabel(map.get(MEMBER_HEX))).toBe('Editor · Not voted');
  });
});
