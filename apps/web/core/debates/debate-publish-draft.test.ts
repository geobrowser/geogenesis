import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { ID } from '~/core/id';
import { Publish } from '~/core/utils/publish';

import {
  type DebatePublishInput,
  buildDebatePublishDraft,
  mergeTranscriptSegmentsIntoTurns,
} from './debate-publish-draft';
import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';

import {
  AUTHORS_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_PARTICIPANTS_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
  IMAGE_TYPE_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  NAME_PROPERTY_ID,
  SOURCES_PROPERTY_ID,
  TRANSCRIPT_TYPE_ID,
  TYPES_PROPERTY_ID,
  VIDEO_TYPE_ID,
  VIDEO_URL_PROPERTY_ID,
} from './ontology';

const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const CLAIM_ENTITY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const YES_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NO_SPACE = 'cccccccccccccccccccccccccccccccc';

function idFactory() {
  let n = 0;
  return () => `id${(n++).toString().padStart(30, '0')}`;
}

function baseInput(overrides: Partial<DebatePublishInput> = {}): DebatePublishInput {
  return {
    debateId: '11112222-3333-4444-5555-666677778888',
    spaceId: SPACE,
    claimEntityId: CLAIM_ENTITY,
    claimText: 'The US should have attacked Iran',
    participants: [
      { spaceEntityId: YES_SPACE, displayName: 'Arturas', position: true, participantSlot: 1 },
      { spaceEntityId: NO_SPACE, displayName: 'Preston', position: false, participantSlot: 2 },
    ],
    videoUrl: 'ipfs://bafyfinalvideo',
    keyframeUrl: 'ipfs://bafykeyframe',
    transcriptTurns: [
      { turnIndex: 0, speakerSpaceEntityId: YES_SPACE, speakerName: 'Arturas', text: 'Iran was building a nuke.' },
      { turnIndex: 1, speakerSpaceEntityId: NO_SPACE, speakerName: 'Preston', text: 'There was no congressional approval.' },
    ],
    ...overrides,
  };
}

describe('buildDebatePublishDraft', () => {
  it('derives a deterministic dashless entity id and a "A vs. B on claim" name', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    expect(draft.debateEntityId).toBe('11112222333344445555666677778888');
    expect(draft.debateName).toBe('Arturas vs. Preston on The US should have attacked Iran');
  });

  it('names participants in slot order regardless of input order', () => {
    const draft = buildDebatePublishDraft(
      baseInput({
        participants: [
          { spaceEntityId: NO_SPACE, displayName: 'Preston', position: false, participantSlot: 2 },
          { spaceEntityId: YES_SPACE, displayName: 'Arturas', position: true, participantSlot: 1 },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    expect(draft.debateName).toBe('Arturas vs. Preston on The US should have attacked Iran');
  });

  // Preston: "Can we also add a participants relation to both participants. This will be useful for
  // creating a data block with all the debates that I have participated in."
  //
  // Supported by / Opposed by already name everyone, but they encode which side — so that data
  // block would have to union two relations and know which one to look on. This is the
  // side-agnostic membership, and it uses the canonical `SystemIds.PARTICIPANTS_PROPERTY` so the
  // query is the same one any other participant-bearing entity answers to.
  it('relates both participants side-agnostically, as well as by side', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });

    const participants = draft.relations.filter(r => r.type.id === DEBATE_PARTICIPANTS_PROPERTY_ID);
    expect(participants).toHaveLength(2);

    // Both sides, one relation. Sorted so the assertion does not depend on slot order.
    const supported = draft.relations.find(r => r.type.id === DEBATE_SUPPORTED_BY_PROPERTY_ID);
    const opposed = draft.relations.find(r => r.type.id === DEBATE_OPPOSED_BY_PROPERTY_ID);
    expect([...participants.map(r => r.toEntity.id)].sort()).toEqual(
      [supported!.toEntity.id, opposed!.toEntity.id].sort()
    );

    // And it does not replace them — a debate still records who argued which way.
    expect(supported).toBeDefined();
    expect(opposed).toBeDefined();

    // Every Participants relation hangs off the debate itself, not off a block or the claim.
    for (const relation of participants) {
      expect(relation.fromEntity.id).toBe(draft.debateEntityId);
    }
  });

  it('links Supported by to the yes participant and Opposed by to the no participant', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    const supported = draft.relations.find(r => r.type.id === DEBATE_SUPPORTED_BY_PROPERTY_ID);
    const opposed = draft.relations.find(r => r.type.id === DEBATE_OPPOSED_BY_PROPERTY_ID);
    expect(supported?.toEntity.id).toBe(YES_SPACE);
    expect(opposed?.toEntity.id).toBe(NO_SPACE);
  });

  it('emits Debate, Video, and Transcript type relations', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    const typeTargets = draft.relations.filter(r => r.type.id === TYPES_PROPERTY_ID).map(r => r.toEntity.id);
    expect(typeTargets).toContain(DEBATE_TYPE_ID);
    expect(typeTargets).toContain(VIDEO_TYPE_ID);
    expect(typeTargets).toContain(TRANSCRIPT_TYPE_ID);
  });

  it('skips the Video entity when there is no video URL', () => {
    const draft = buildDebatePublishDraft(baseInput({ videoUrl: null }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });
    expect(draft.relations.some(r => r.toEntity.id === VIDEO_TYPE_ID)).toBe(false);
  });

  // A Video that sets nothing but `Video URL` renders as an empty relation.
  it('writes the video URL to both the unified IPFS URL property and Video URL', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    const videoId = draft.relations.find(r => r.toEntity.id === VIDEO_TYPE_ID)?.fromEntity.id;
    const videoValues = draft.values.filter(v => v.entity.id === videoId);
    expect(videoValues.find(v => v.property.id === IMAGE_URL_PROPERTY_ID)?.value).toBe('ipfs://bafyfinalvideo');
    expect(videoValues.find(v => v.property.id === VIDEO_URL_PROPERTY_ID)?.value).toBe('ipfs://bafyfinalvideo');
  });

  it('links a Key frame Image onto the Video', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    const videoId = draft.relations.find(r => r.toEntity.id === VIDEO_TYPE_ID)?.fromEntity.id;
    const keyframe = draft.relations.find(r => r.type.id === KEY_FRAME_IMAGE_PROPERTY_ID);
    expect(keyframe?.fromEntity.id).toBe(videoId);
    expect(
      draft.values.find(v => v.entity.id === keyframe?.toEntity.id && v.property.id === IMAGE_URL_PROPERTY_ID)?.value
    ).toBe('ipfs://bafykeyframe');
    expect(
      draft.relations.some(r => r.fromEntity.id === keyframe?.toEntity.id && r.toEntity.id === IMAGE_TYPE_ID)
    ).toBe(true);
  });

  it('publishes the Video without a Key frame when no keyframe was pinned', () => {
    const draft = buildDebatePublishDraft(baseInput({ keyframeUrl: null }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });
    expect(draft.relations.some(r => r.toEntity.id === VIDEO_TYPE_ID)).toBe(true);
    expect(draft.relations.some(r => r.type.id === KEY_FRAME_IMAGE_PROPERTY_ID)).toBe(false);
  });

  it('skips the Transcript entity when there are no turns', () => {
    const draft = buildDebatePublishDraft(baseInput({ transcriptTurns: [] }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });
    expect(draft.relations.some(r => r.toEntity.id === TRANSCRIPT_TYPE_ID)).toBe(false);
  });

  it('throws on empty claim text or no participants', () => {
    expect(() => buildDebatePublishDraft(baseInput({ claimText: '  ' }))).toThrow();
    expect(() => buildDebatePublishDraft(baseInput({ participants: [] }))).toThrow();
  });

  it('produces a valid non-empty edit through the real publish op pipeline', async () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: ID.createEntityId });
    const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, SPACE));
    expect(ops.length).toBeGreaterThan(0);
  });

  const claimIdByName = (draft: ReturnType<typeof buildDebatePublishDraft>, name: string) =>
    draft.values.find(v => v.property.id === NAME_PROPERTY_ID && v.value === name)?.entity.id;

  const blockAuthoringClaim = (draft: ReturnType<typeof buildDebatePublishDraft>, claimId: string | undefined) => {
    const blockClaimRel = draft.relations.find(r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === claimId);
    const blockId = blockClaimRel?.fromEntity.id;
    return draft.relations.find(r => r.type.id === AUTHORS_PROPERTY_ID && r.fromEntity.id === blockId)?.toEntity.id;
  };

  it('mints a Claim per extracted claim, attributed to its turn block, with Is factual set', () => {
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          { text: 'Iran was developing a nuclear weapon', isFactual: true, turnIndex: 0 },
          { text: 'Attacking Iran was wrong', isFactual: false, turnIndex: 1 },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );

    // One Claim entity (Types -> Claim) per extracted claim.
    const claimTypeRels = draft.relations.filter(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID);
    expect(claimTypeRels).toHaveLength(2);

    // Fact claim: Is factual = true (BOOLEAN), attributed to the YES speaker's block, Sources -> Debate.
    const factClaimId = claimIdByName(draft, 'Iran was developing a nuclear weapon');
    const factBool = draft.values.find(v => v.entity.id === factClaimId && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID);
    expect(factBool?.value).toBe('true');
    expect(factBool?.property.dataType).toBe('BOOLEAN');
    expect(blockAuthoringClaim(draft, factClaimId)).toBe(YES_SPACE);
    expect(
      draft.relations.some(
        r => r.type.id === SOURCES_PROPERTY_ID && r.fromEntity.id === factClaimId && r.toEntity.id === draft.debateEntityId
      )
    ).toBe(true);

    // Opinion claim: Is factual = false, attributed to the NO speaker's block.
    const opinionClaimId = claimIdByName(draft, 'Attacking Iran was wrong');
    expect(
      draft.values.find(v => v.entity.id === opinionClaimId && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID)?.value
    ).toBe('false');
    expect(blockAuthoringClaim(draft, opinionClaimId)).toBe(NO_SPACE);
  });

  it('attributes claims by turn_index, not array position, when the two diverge', () => {
    // geo-chat's turn_index need not equal the JS array position: a turn Rust kept but a JS-side
    // whitespace filter would drop (e.g. a lone U+FEFF) leaves a gap. Keying claims by turnIndex —
    // not forEach position — keeps each claim on its own speaker's block regardless.
    const draft = buildDebatePublishDraft(
      baseInput({
        transcriptTurns: [
          { turnIndex: 3, speakerSpaceEntityId: YES_SPACE, speakerName: 'Arturas', text: 'Yes-side turn.' },
          { turnIndex: 7, speakerSpaceEntityId: NO_SPACE, speakerName: 'Preston', text: 'No-side turn.' },
        ],
        claims: [
          { text: 'Belongs to the no-side turn', isFactual: true, turnIndex: 7 },
          { text: 'Belongs to the yes-side turn', isFactual: false, turnIndex: 3 },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    // Positional keying would drop turnIndex 7 (only two turns) and misplace turnIndex 3.
    expect(blockAuthoringClaim(draft, claimIdByName(draft, 'Belongs to the no-side turn'))).toBe(NO_SPACE);
    expect(blockAuthoringClaim(draft, claimIdByName(draft, 'Belongs to the yes-side turn'))).toBe(YES_SPACE);
  });

  it('omits the Is factual value when factuality is null', () => {
    const draft = buildDebatePublishDraft(baseInput({ claims: [{ text: 'Unclassified claim', isFactual: null, turnIndex: 0 }] }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });
    const claimId = claimIdByName(draft, 'Unclassified claim');
    expect(claimId).toBeTruthy();
    expect(draft.values.some(v => v.entity.id === claimId && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID)).toBe(false);
  });

  it('mints no Claim entities when no claims are provided (backwards compatible)', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    expect(draft.relations.some(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID)).toBe(false);
  });

  it('drops a claim whose turnIndex has no matching turn', () => {
    const draft = buildDebatePublishDraft(baseInput({ claims: [{ text: 'Ghost claim', isFactual: true, turnIndex: 5 }] }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });
    expect(draft.values.some(v => v.value === 'Ghost claim')).toBe(false);
  });

  it('claim ops (incl. the boolean) survive the real publish pipeline', async () => {
    const draft = buildDebatePublishDraft(
      baseInput({ claims: [{ text: 'Verifiable thing', isFactual: true, turnIndex: 0 }] }),
      { createEntityId: ID.createEntityId }
    );
    const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, SPACE));
    expect(ops.length).toBeGreaterThan(0);
  });
});

describe('mergeTranscriptSegmentsIntoTurns', () => {
  const speakers = new Map([
    [1, { spaceEntityId: YES_SPACE, displayName: 'Arturas' }],
    [2, { spaceEntityId: NO_SPACE, displayName: 'Preston' }],
  ]);

  it('merges consecutive same-speaker segments into one turn', () => {
    const turns = mergeTranscriptSegmentsIntoTurns(
      [
        { participantSlot: 1, text: 'Iran was building a nuke.' },
        { participantSlot: 1, text: 'They fund terror.' },
        { participantSlot: 2, text: 'No approval.' },
        { participantSlot: 1, text: 'The court has not ruled.' },
      ],
      speakers
    );
    expect(turns.map(t => t.speakerName)).toEqual(['Arturas', 'Preston', 'Arturas']);
    expect(turns[0].text).toBe('Iran was building a nuke. They fund terror.');
  });

  it('drops empty segments and unknown speakers', () => {
    const turns = mergeTranscriptSegmentsIntoTurns(
      [
        { participantSlot: 1, text: '  ' },
        { participantSlot: 9, text: 'ghost' },
        { participantSlot: 2, text: 'Real point.' },
      ],
      speakers
    );
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe('Real point.');
  });
});
