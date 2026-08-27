import { describe, expect, it } from 'vitest';

import type { DebateTranscriptClaimsQuery } from '../io/debate-transcript-claims-document';
import { claimsForParticipant, groupTranscriptClaims, unmatchedClaims } from './transcript-claims';

const PRESTON = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const ARTURAS = 'cc31e40f74231d530f1b5d0fc1cd94d8';

const SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

type Claim = {
  id: string;
  name?: string | null;
  position?: string;
  /** null models a claim the graph reports no space for. */
  spaceId?: string | null;
};

type Block = {
  id: string;
  position?: string;
  author?: string | null;
  claims: Claim[];
};

function response(blocks: Block[], transcriptPosition = 'a0'): DebateTranscriptClaimsQuery {
  return {
    entity: {
      transcripts: [
        {
          position: transcriptPosition,
          toEntity: {
            id: 'transcript-1',
            blocks: blocks.map(block => ({
              position: block.position ?? 'a0',
              toEntity: {
                id: block.id,
                authors: block.author === null ? [] : [{ position: 'a0', toEntity: { id: block.author ?? PRESTON } }],
                claims: block.claims.map(claim => {
                  const spaceId = claim.spaceId === undefined ? SPACE : claim.spaceId;
                  return {
                    position: claim.position ?? 'a0',
                    toEntity: {
                      id: claim.id,
                      name: claim.name === undefined ? `Claim ${claim.id}` : claim.name,
                      spaceIds: spaceId === null ? [] : [spaceId],
                    },
                  };
                }),
              },
            })),
          },
        },
      ],
    },
  };
}

describe('groupTranscriptClaims', () => {
  it('groups a turn’s claims under the block author, not the claim', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }, { id: 'claim-2' }] },
        { id: 'block-2', author: ARTURAS, claims: [{ id: 'claim-3' }] },
      ])
    );

    expect(grouped.totalCount).toBe(3);
    expect(claimsForParticipant(grouped, PRESTON).map(claim => claim.id)).toEqual(['claim-1', 'claim-2']);
    expect(claimsForParticipant(grouped, ARTURAS).map(claim => claim.id)).toEqual(['claim-3']);
  });

  it('matches a participant whose space id is dashed rather than hex', () => {
    const grouped = groupTranscriptClaims(response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] }]));

    expect(claimsForParticipant(grouped, 'f3dab79c-b5a3-d9d1-7596-56dd5361d1c6')).toHaveLength(1);
  });

  it('orders blocks and claims by position rather than list order', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-late', position: 'a2', author: PRESTON, claims: [{ id: 'claim-third' }] },
        {
          id: 'block-early',
          position: 'a1',
          author: PRESTON,
          claims: [
            { id: 'claim-second', position: 'a2' },
            { id: 'claim-first', position: 'a1' },
          ],
        },
      ])
    );

    expect(claimsForParticipant(grouped, PRESTON).map(claim => claim.id)).toEqual([
      'claim-first',
      'claim-second',
      'claim-third',
    ]);
  });

  it('counts a claim once when the graph returns it twice', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }, { id: 'claim-1' }] },
        { id: 'block-2', author: PRESTON, claims: [{ id: 'claim-1' }] },
      ])
    );

    expect(grouped.totalCount).toBe(1);
    expect(claimsForParticipant(grouped, PRESTON)).toHaveLength(1);
  });

  it('attributes a claim repeated by the other debater to whoever said it first', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', position: 'a1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: ARTURAS, claims: [{ id: 'claim-1' }] },
      ])
    );

    expect(claimsForParticipant(grouped, PRESTON)).toHaveLength(1);
    expect(claimsForParticipant(grouped, ARTURAS)).toHaveLength(0);
  });

  it('drops claims with no text, since the text is the name', () => {
    const grouped = groupTranscriptClaims(
      response([
        {
          id: 'block-1',
          author: PRESTON,
          claims: [{ id: 'claim-1', name: null }, { id: 'claim-2', name: '   ' }, { id: 'claim-3' }],
        },
      ])
    );

    expect(grouped.totalCount).toBe(1);
    expect(claimsForParticipant(grouped, PRESTON).map(claim => claim.id)).toEqual(['claim-3']);
  });

  it('collects claims from a block with no author as unattributed', () => {
    const grouped = groupTranscriptClaims(response([{ id: 'block-1', author: null, claims: [{ id: 'claim-1' }] }]));

    expect(grouped.totalCount).toBe(1);
    expect(grouped.byAuthorSpaceId.size).toBe(0);
    expect(grouped.unattributed.map(claim => claim.id)).toEqual(['claim-1']);
  });

  it('returns an empty grouping for a debate with no transcript', () => {
    expect(groupTranscriptClaims({ entity: { transcripts: [] } }).totalCount).toBe(0);
    expect(groupTranscriptClaims({ entity: null }).totalCount).toBe(0);
    expect(groupTranscriptClaims({ entity: { transcripts: null } }).totalCount).toBe(0);
  });
});

describe('unmatchedClaims', () => {
  it('surfaces claims by an author who is not a participant', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', author: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', claims: [{ id: 'claim-2' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-2']);
  });

  it('includes unattributed claims and finds nothing when every author is a participant', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', author: null, claims: [{ id: 'claim-2' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-2']);
    expect(
      unmatchedClaims(groupTranscriptClaims(response([{ id: 'b', author: PRESTON, claims: [] }])), [
        'f3dab79c-b5a3-d9d1-7596-56dd5361d1c6',
      ])
    ).toEqual([]);
  });
});

describe('claim space', () => {
  it('carries the claim’s own space, which is where its responses are published', () => {
    const grouped = groupTranscriptClaims(response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] }]));

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBe(SPACE);
  });

  // Both the link target and the row's actions are space-scoped, so a claim the graph reports no
  // space for has nothing correct to point at and the panel renders it as inert text.
  it('leaves a claim with no space unlinkable rather than guessing one', () => {
    const grouped = groupTranscriptClaims(
      response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1', spaceId: null }] }])
    );

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBeNull();
  });
});

describe('all', () => {
  it('lists every claim once, in transcript order, matching totalCount', () => {
    const grouped = groupTranscriptClaims(
      response([
        { id: 'block-1', position: 'a1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: ARTURAS, claims: [{ id: 'claim-2' }, { id: 'claim-1' }] },
      ])
    );

    expect(grouped.all.map(claim => claim.id)).toEqual(['claim-1', 'claim-2']);
    expect(grouped.totalCount).toBe(grouped.all.length);
  });
});
