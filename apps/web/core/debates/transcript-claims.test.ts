import { describe, expect, it } from 'vitest';

import type { DebateTranscriptClaimsQuery } from '../io/debate-transcript-claims-document';
import { claimsForParticipant, groupTranscriptClaims, unmatchedClaims } from './transcript-claims';

const PRESTON = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const ARTURAS = 'cc31e40f74231d530f1b5d0fc1cd94d8';

const SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

/** The traversal is scoped to the debate's publication space; these fixtures all live in one. */
const group = (data: DebateTranscriptClaimsQuery) => groupTranscriptClaims(data, SPACE);

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
                      // Aggregated across spaces, so it is only the resolver's last resort.
                      name: claim.name === undefined ? `Claim ${claim.id}` : claim.name,
                      spaceIds: spaceId === null ? [] : [spaceId],
                      names:
                        claim.name === undefined
                          ? spaceId === null
                            ? []
                            : [{ spaceId, text: `Claim ${claim.id}` }]
                          : claim.name === null
                            ? []
                            : spaceId === null
                              ? []
                              : [{ spaceId, text: claim.name }],
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
    const grouped = group(
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
    const grouped = group(response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] }]));

    expect(claimsForParticipant(grouped, 'f3dab79c-b5a3-d9d1-7596-56dd5361d1c6')).toHaveLength(1);
  });

  it('orders blocks and claims by position rather than list order', () => {
    const grouped = group(
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
    const grouped = group(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }, { id: 'claim-1' }] },
        { id: 'block-2', author: PRESTON, claims: [{ id: 'claim-1' }] },
      ])
    );

    expect(grouped.totalCount).toBe(1);
    expect(claimsForParticipant(grouped, PRESTON)).toHaveLength(1);
  });

  it('attributes a claim repeated by the other debater to whoever said it first', () => {
    const grouped = group(
      response([
        { id: 'block-1', position: 'a1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: ARTURAS, claims: [{ id: 'claim-1' }] },
      ])
    );

    expect(claimsForParticipant(grouped, PRESTON)).toHaveLength(1);
    expect(claimsForParticipant(grouped, ARTURAS)).toHaveLength(0);
  });

  it('drops claims with no text, since the text is the name', () => {
    const grouped = group(
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
    const grouped = group(response([{ id: 'block-1', author: null, claims: [{ id: 'claim-1' }] }]));

    expect(grouped.totalCount).toBe(1);
    expect(grouped.byAuthorSpaceId.size).toBe(0);
    expect(grouped.unattributed.map(claim => claim.id)).toEqual(['claim-1']);
  });

  it('returns an empty grouping for a debate with no transcript', () => {
    expect(group({ entity: { transcripts: [] } }).totalCount).toBe(0);
    expect(group({ entity: null }).totalCount).toBe(0);
    expect(group({ entity: { transcripts: null } }).totalCount).toBe(0);
  });
});

describe('unmatchedClaims', () => {
  it('surfaces claims by an author who is not a participant', () => {
    const grouped = group(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', author: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', claims: [{ id: 'claim-2' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-2']);
  });

  // Regression: this used to walk the author map and then append the unattributed ones, so one
  // unknown author's claims came out grouped together and every unauthored claim was pushed to the
  // end — an A/B/A transcript surfaced as A/A/B.
  it('keeps transcript order across unknown authors and unauthored claims', () => {
    const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const grouped = group(
      response([
        { id: 'block-1', position: 'a1', author: STRANGER, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: null, claims: [{ id: 'claim-2' }] },
        { id: 'block-3', position: 'a3', author: STRANGER, claims: [{ id: 'claim-3' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-1', 'claim-2', 'claim-3']);
  });

  it('leaves a participant’s claims out while keeping the rest in transcript order', () => {
    const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const grouped = group(
      response([
        { id: 'block-1', position: 'a1', author: STRANGER, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: PRESTON, claims: [{ id: 'claim-mine' }] },
        { id: 'block-3', position: 'a3', author: null, claims: [{ id: 'claim-3' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-1', 'claim-3']);
  });

  it('includes unattributed claims and finds nothing when every author is a participant', () => {
    const grouped = group(
      response([
        { id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', author: null, claims: [{ id: 'claim-2' }] },
      ])
    );

    expect(unmatchedClaims(grouped, [PRESTON]).map(claim => claim.id)).toEqual(['claim-2']);
    expect(
      unmatchedClaims(group(response([{ id: 'b', author: PRESTON, claims: [] }])), [
        'f3dab79c-b5a3-d9d1-7596-56dd5361d1c6',
      ])
    ).toEqual([]);
  });
});

describe('claim space', () => {
  it('carries the claim’s own space, which is where its responses are published', () => {
    const grouped = group(response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1' }] }]));

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBe(SPACE);
  });

  // Both the link target and the row's actions are space-scoped, so a claim the graph reports no
  // space for has nothing correct to point at and the panel renders it as inert text.
  it('leaves a claim with no space unlinkable rather than guessing one', () => {
    const grouped = group(response([{ id: 'block-1', author: PRESTON, claims: [{ id: 'claim-1', spaceId: null }] }]));

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBeNull();
  });
});

describe('all', () => {
  it('lists every claim once, in transcript order, matching totalCount', () => {
    const grouped = group(
      response([
        { id: 'block-1', position: 'a1', author: PRESTON, claims: [{ id: 'claim-1' }] },
        { id: 'block-2', position: 'a2', author: ARTURAS, claims: [{ id: 'claim-2' }, { id: 'claim-1' }] },
      ])
    );

    expect(grouped.all.map(claim => claim.id)).toEqual(['claim-1', 'claim-2']);
    expect(grouped.totalCount).toBe(grouped.all.length);
  });
});

/** A claim entity with Name values in several spaces, as the query returns them. */
function multiSpaceClaim(names: Array<{ spaceId: string; text: string }>, aggregated: string | null) {
  return {
    entity: {
      transcripts: [
        {
          position: 'a0',
          toEntity: {
            id: 'transcript-1',
            blocks: [
              {
                position: 'a0',
                toEntity: {
                  id: 'block-1',
                  authors: [{ position: 'a0', toEntity: { id: PRESTON } }],
                  claims: [
                    {
                      position: 'a0',
                      toEntity: {
                        id: 'claim-1',
                        name: aggregated,
                        spaceIds: names.map(value => value.spaceId),
                        names,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

describe('claim text resolution', () => {
  // `toEntity.name` merges every space, so a Name published elsewhere could rewrite what a debater
  // is shown to have said — the cross-space attribution the relation filters exist to stop,
  // arriving through the text instead of the link.
  it('shows the sentence named in the debate’s space, not the aggregated name', () => {
    const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const grouped = groupTranscriptClaims(
      multiSpaceClaim(
        [
          { spaceId: OTHER, text: 'Something the speaker never said.' },
          { spaceId: SPACE, text: 'What the speaker actually said.' },
        ],
        'Something the speaker never said.'
      ),
      SPACE
    );

    expect(claimsForParticipant(grouped, PRESTON)[0].text).toBe('What the speaker actually said.');
  });

  it('falls back to the aggregated name only when no space names the claim', () => {
    const grouped = groupTranscriptClaims(multiSpaceClaim([], 'Only the aggregated name.'), SPACE);

    expect(claimsForParticipant(grouped, PRESTON)[0].text).toBe('Only the aggregated name.');
  });

  it('drops a claim that no space names and that has no aggregated name either', () => {
    const grouped = groupTranscriptClaims(multiSpaceClaim([], null), SPACE);

    expect(grouped.totalCount).toBe(0);
  });
});

describe('space scoping', () => {
  // Relations are space-attributed and anyone may publish one in their own space pointing at any
  // entity, so the traversal is filtered to the debate's publication space. The claim's own row has
  // to follow that space too: a claim also curated elsewhere would otherwise hand its link and its
  // response controls a space outside the debate being shown.
  it('prefers the debate’s space over whichever space the claim lists first', () => {
    const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const grouped = groupTranscriptClaims(
      {
        entity: {
          transcripts: [
            {
              position: 'a0',
              toEntity: {
                id: 'transcript-1',
                blocks: [
                  {
                    position: 'a0',
                    toEntity: {
                      id: 'block-1',
                      authors: [{ position: 'a0', toEntity: { id: PRESTON } }],
                      claims: [
                        { position: 'a0', toEntity: { id: 'claim-1', name: 'Claim one', spaceIds: [OTHER, SPACE] } },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      SPACE
    );

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBe(SPACE);
  });

  // `spaceIds` is not a home-space list — it also counts spaces holding an outbound relation — so
  // its raw first entry can be a space that merely cites the claim. Resolution is deferred to
  // `entityHomeSpaceId`, the same rule the entity side panel and data block rows follow.
  it('resolves an external claim to the space that names it, not the first id listed', () => {
    const CITING = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const NAMING = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const grouped = groupTranscriptClaims(
      {
        entity: {
          transcripts: [
            {
              position: 'a0',
              toEntity: {
                id: 'transcript-1',
                blocks: [
                  {
                    position: 'a0',
                    toEntity: {
                      id: 'block-1',
                      authors: [{ position: 'a0', toEntity: { id: PRESTON } }],
                      claims: [
                        {
                          position: 'a0',
                          toEntity: {
                            id: 'claim-1',
                            name: 'External claim',
                            // The citing space is listed first and does not name the claim.
                            spaceIds: [CITING, NAMING],
                            names: [{ spaceId: NAMING, text: 'External claim' }],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      SPACE
    );

    expect(claimsForParticipant(grouped, PRESTON)[0].spaceId).toBe(NAMING);
  });
});
