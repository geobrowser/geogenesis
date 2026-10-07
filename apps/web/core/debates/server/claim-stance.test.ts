import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_STANCE_PROPERTY_IDS, type DebateClaimInput, buildDebatePublishDraft } from '../debate-publish-draft';
import { CLAIM_ADDRESSES_PROPERTY_ID, CLAIM_SUPPORTS_PROPERTY_ID } from '../ontology';
import { applyClaimStancePolicy } from './claim-stance';
import type { RelationTarget, RelationTargetsPageFetcher } from './relation-targets';

const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const MOTION = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_MOTION = 'dddddddddddddddddddddddddddddddd';
const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
const STABLE = '5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b';
const YES_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const graphWith =
  (relations: RelationTarget[]): RelationTargetsPageFetcher =>
  async request => ({
    items: relations.filter(r => request.fromEntityIds.includes(r.fromEntityId) && request.typeIds.includes(r.typeId)),
    endCursor: null,
    hasNextPage: false,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyClaimStancePolicy', () => {
  it('keeps the stance a claim already carries toward the motion, and only that one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchRelationPage = vi.fn(
      graphWith([
        // The backfill (or an earlier debate on this motion) already linked the reused entity.
        { fromEntityId: EXISTING, typeId: CLAIM_ADDRESSES_PROPERTY_ID, toEntityId: MOTION },
        // A stance toward some other motion is not this one and does not count.
        { fromEntityId: STABLE, typeId: CLAIM_SUPPORTS_PROPERTY_ID, toEntityId: OTHER_MOTION },
      ])
    );
    const claims: DebateClaimInput[] = [
      { text: 'Reused.', isFactual: false, turnIndex: 0, existingClaimEntityId: EXISTING, stance: 'opposes' },
      { text: 'Stable.', isFactual: false, turnIndex: 0, stableEntityId: STABLE, stance: 'supports' },
      { text: 'Minted.', isFactual: false, turnIndex: 0, stance: 'addresses' },
    ];
    const result = await applyClaimStancePolicy(claims, SPACE, MOTION, { fetchRelationPage });
    expect(result.map(c => c.stance)).toEqual([null, 'supports', 'addresses']);
    // One read, over only the claims that could already exist, for all three relation types.
    expect(fetchRelationPage).toHaveBeenCalledTimes(1);
    const [request] = fetchRelationPage.mock.calls[0];
    expect(request.fromEntityIds.sort()).toEqual([EXISTING, STABLE].sort());
    expect(request.typeIds.sort()).toEqual(Object.values(CLAIM_STANCE_PROPERTY_IDS).sort());
    expect(request.spaceId).toBe(SPACE);
  });

  it('reads nothing when no claim could already exist', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchRelationPage = vi.fn(graphWith([]));
    const claims: DebateClaimInput[] = [{ text: 'Minted.', isFactual: false, turnIndex: 0, stance: 'supports' }];
    expect(await applyClaimStancePolicy(claims, SPACE, MOTION, { fetchRelationPage })).toEqual(claims);
    expect(fetchRelationPage).not.toHaveBeenCalled();
  });

  it('withholds the stance of every looked-up claim when the read fails, never the minted ones', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const claims: DebateClaimInput[] = [
      { text: 'Reused.', isFactual: false, turnIndex: 0, existingClaimEntityId: EXISTING, stance: 'opposes' },
      { text: 'Minted.', isFactual: false, turnIndex: 0, stance: 'addresses' },
    ];
    const result = await applyClaimStancePolicy(claims, SPACE, MOTION, {
      fetchRelationPage: async () => {
        throw new Error('graph down');
      },
    });
    expect(result.map(c => c.stance)).toEqual([null, 'addresses']);
    expect(warn).toHaveBeenCalled();
  });

  it('re-publishing a debate whose claims are already on the graph writes no second relation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = (claims: DebateClaimInput[]) => ({
      debateId: '11112222-3333-4444-5555-666677778888',
      spaceId: SPACE,
      claimEntityId: MOTION,
      claimText: 'Open-source AI models should be restricted',
      participants: [{ spaceEntityId: YES_SPACE, displayName: 'A', position: true, participantSlot: 1 }],
      videoUrl: null,
      keyframeUrl: null,
      ogImageUrl: null,
      transcriptTurns: [{ turnIndex: 0, speakerSpaceEntityId: YES_SPACE, speakerName: 'A', text: 'Hello.' }],
      claims,
    });
    const claims: DebateClaimInput[] = [
      {
        text: 'Regulating open-source AI is hard.',
        isFactual: false,
        turnIndex: 0,
        stableEntityId: STABLE,
        stance: 'opposes',
      },
      { text: 'Reused.', isFactual: false, turnIndex: 0, existingClaimEntityId: EXISTING, stance: 'supports' },
    ];
    const stanceTypes = Object.values(CLAIM_STANCE_PROPERTY_IDS);

    // First publish: nothing on the graph yet, so both relations are written.
    const first = buildDebatePublishDraft(
      input(await applyClaimStancePolicy(claims, SPACE, MOTION, { fetchRelationPage: graphWith([]) }))
    );
    const written = first.relations
      .filter(r => stanceTypes.includes(r.type.id))
      .map(r => ({ fromEntityId: r.fromEntity.id, typeId: r.type.id, toEntityId: r.toEntity.id }));
    expect(written).toHaveLength(2);

    // A retry or re-publish sees what the first one wrote and writes none.
    const second = buildDebatePublishDraft(
      input(await applyClaimStancePolicy(claims, SPACE, MOTION, { fetchRelationPage: graphWith(written) }))
    );
    expect(second.relations.filter(r => stanceTypes.includes(r.type.id))).toHaveLength(0);
  });
});
