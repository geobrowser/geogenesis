import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { Publish } from '~/core/utils/publish';

import {
  type DebatePublishInput,
  buildDebateClaimsDraft,
  buildDebatePublishDraft,
  mergeTranscriptSegmentsIntoTurns,
  stableClaimRelationIds,
} from './debate-publish-draft';
import {
  AUTHORS_PROPERTY_ID,
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_PARTICIPANTS_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  DEBATE_TYPE_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_TYPE_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  NAME_PROPERTY_ID,
  OG_IMAGE_PROPERTY_ID,
  SELECTOR_TYPE_ID,
  SOURCES_PROPERTY_ID,
  TARGET_PROPERTY_ID,
  TRANSCRIPT_TYPE_ID,
  TYPES_PROPERTY_ID,
  VIDEO_TYPE_ID,
  VIDEO_URL_PROPERTY_ID,
  WEB_URL_PROPERTY_ID,
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
    videoUrl: 'https://chat.example/debates/11112222-3333-4444-5555-666677778888/media/artifacts/final_video/content',
    // Default off: most cases here are about the debate, video and transcript entities. The share
    // card gets its own block below, where its absence is also asserted.
    ogImageUrl: null,
    keyframeUrl:
      'https://chat.example/debates/11112222-3333-4444-5555-666677778888/media/artifacts/preview_image/content',
    transcriptTurns: [
      { turnIndex: 0, speakerSpaceEntityId: YES_SPACE, speakerName: 'Arturas', text: 'Iran was building a nuke.' },
      {
        turnIndex: 1,
        speakerSpaceEntityId: NO_SPACE,
        speakerName: 'Preston',
        text: 'There was no congressional approval.',
      },
    ],
    ...overrides,
  };
}

describe('buildDebatePublishDraft', () => {
  it('derives a deterministic dashless entity id and a "claim | A vs. B" name', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    expect(draft.debateEntityId).toBe('11112222333344445555666677778888');
    expect(draft.debateName).toBe('The US should have attacked Iran | Arturas vs. Preston');
  });

  it("mirrors the debated claim's topics onto the Debate, one relation per topic", () => {
    const TOPIC_A = 'dddddddddddddddddddddddddddddddd';
    const TOPIC_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const draft = buildDebatePublishDraft(
      baseInput({
        claimTopics: [
          { id: TOPIC_A, name: 'Foreign policy' },
          { id: TOPIC_B, name: 'Iran' },
          // Same entity as TOPIC_B, dashless: one topic, one relation.
          { id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', name: 'Iran' },
        ],
      }),
      { createEntityId: idFactory() }
    );

    const debateTopics = draft.relations.filter(
      r => r.type.id === TOPICS_PROPERTY_ID && r.fromEntity.id === draft.debateEntityId
    );
    expect(debateTopics.map(r => [r.toEntity.id, r.toEntity.name])).toEqual([
      [TOPIC_A, 'Foreign policy'],
      [TOPIC_B, 'Iran'],
    ]);
    expect(debateTopics.every(r => r.spaceId === SPACE)).toBe(true);
  });

  it('writes no Topics on the Debate when the debated claim has none', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory() });
    expect(
      draft.relations.filter(r => r.type.id === TOPICS_PROPERTY_ID && r.fromEntity.id === draft.debateEntityId)
    ).toEqual([]);
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
    expect(draft.debateName).toBe('The US should have attacked Iran | Arturas vs. Preston');
  });

  // The Video, keyframe, share card and Transcript hang their names off the debate's, and every one
  // of them is a `Name` value someone reads in the graph. They went unasserted while the suffix was
  // a bare space, which is how "… vs. Preston video" survived — the qualifier ran straight onto a
  // person's name. Pinned here so the separator cannot silently go missing from one of the four.
  it('qualifies each derived entity name with the same separator', () => {
    const draft = buildDebatePublishDraft(baseInput({ ogImageUrl: 'ipfs://QmShareCard' }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });

    const namesOf = (entityIds: string[]) =>
      entityIds.map(id => draft.values.find(v => v.entity.id === id && v.property.id === NAME_PROPERTY_ID)?.value);

    const debate = 'The US should have attacked Iran | Arturas vs. Preston';
    const named = (propertyId: string) => draft.relations.filter(r => r.type.id === propertyId).map(r => r.toEntity.id);

    expect(namesOf(named(OG_IMAGE_PROPERTY_ID))).toEqual([`${debate} | share card`]);
    expect(namesOf(named(DEBATE_VIDEOS_PROPERTY_ID))).toEqual([`${debate} | video`]);
    expect(namesOf(named(KEY_FRAME_IMAGE_PROPERTY_ID))).toEqual([`${debate} | keyframe`]);
    expect(namesOf(named(DEBATE_TRANSCRIPTS_PROPERTY_ID))).toEqual([`${debate} | transcript`]);
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

  // The relation decoder reads media URLs from `Web URL` (or `IPFS URL`), not `Video URL`.
  it('writes the video URL to both the Web URL property and Video URL, and never to IPFS URL', () => {
    const input = baseInput();
    const draft = buildDebatePublishDraft(input, { createEntityId: idFactory(), createPosition: () => 'a0' });
    const videoId = draft.relations.find(r => r.toEntity.id === VIDEO_TYPE_ID)?.fromEntity.id;
    const videoValues = draft.values.filter(v => v.entity.id === videoId);
    expect(videoValues.find(v => v.property.id === WEB_URL_PROPERTY_ID)?.value).toBe(input.videoUrl);
    expect(videoValues.find(v => v.property.id === VIDEO_URL_PROPERTY_ID)?.value).toBe(input.videoUrl);
    expect(draft.values.some(v => v.property.id === SystemIds.IMAGE_URL_PROPERTY)).toBe(false);
  });

  it('hangs the share card off the debate, not the video', () => {
    const draft = buildDebatePublishDraft(baseInput({ ogImageUrl: 'ipfs://bafyogcard' }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });

    const debateId = draft.relations.find(relation => relation.toEntity.id === DEBATE_TYPE_ID)?.fromEntity.id;
    const card = draft.relations.find(relation => relation.type.id === OG_IMAGE_PROPERTY_ID);

    // The card describes the debate, and is generated once at publish time — it does not belong to
    // the Video the way the keyframe does.
    expect(card?.fromEntity.id).toBe(debateId);
    const cardValues = draft.values.filter(value => value.entity.id === card?.toEntity.id);
    expect(cardValues.find(value => value.property.id === IMAGE_URL_PROPERTY_ID)?.value).toBe('ipfs://bafyogcard');
    // Typed as an Image, like every other image property on the platform.
    expect(
      draft.relations.some(
        relation =>
          relation.fromEntity.id === card?.toEntity.id &&
          relation.type.id === TYPES_PROPERTY_ID &&
          relation.toEntity.id === IMAGE_TYPE_ID
      )
    ).toBe(true);
  });

  /// A debate rendered before geo-chat produced speaker stills has no card, and must still publish:
  /// the alternative is baking placeholder panels in permanently, since it is generated once.
  it('publishes the debate unchanged when there is no share card', () => {
    const draft = buildDebatePublishDraft(baseInput({ ogImageUrl: null }), {
      createEntityId: idFactory(),
      createPosition: () => 'a0',
    });

    expect(draft.relations.some(relation => relation.type.id === OG_IMAGE_PROPERTY_ID)).toBe(false);
    expect(draft.relations.some(relation => relation.toEntity.id === DEBATE_TYPE_ID)).toBe(true);
    expect(draft.relations.some(relation => relation.toEntity.id === VIDEO_TYPE_ID)).toBe(true);
  });

  it('links a Key frame Image onto the Video', () => {
    const input = baseInput();
    const draft = buildDebatePublishDraft(input, { createEntityId: idFactory(), createPosition: () => 'a0' });
    const videoId = draft.relations.find(r => r.toEntity.id === VIDEO_TYPE_ID)?.fromEntity.id;
    const keyframe = draft.relations.find(r => r.type.id === KEY_FRAME_IMAGE_PROPERTY_ID);
    expect(keyframe?.fromEntity.id).toBe(videoId);
    expect(
      draft.values.find(v => v.entity.id === keyframe?.toEntity.id && v.property.id === WEB_URL_PROPERTY_ID)?.value
    ).toBe(input.keyframeUrl);
    expect(
      draft.relations.some(r => r.fromEntity.id === keyframe?.toEntity.id && r.toEntity.id === IMAGE_TYPE_ID)
    ).toBe(true);
  });

  it('publishes the Video without a Key frame when no keyframe was composed', () => {
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
    const blockClaimRel = draft.relations.find(
      r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === claimId
    );
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
    const claimTypeRels = draft.relations.filter(
      r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID
    );
    expect(claimTypeRels).toHaveLength(2);

    // Fact claim: Is factual = true (BOOLEAN), attributed to the YES speaker's block, Sources -> Debate.
    const factClaimId = claimIdByName(draft, 'Iran was developing a nuclear weapon');
    const factBool = draft.values.find(
      v => v.entity.id === factClaimId && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID
    );
    expect(factBool?.value).toBe('true');
    expect(factBool?.property.dataType).toBe('BOOLEAN');
    expect(blockAuthoringClaim(draft, factClaimId)).toBe(YES_SPACE);
    expect(
      draft.relations.some(
        r =>
          r.type.id === SOURCES_PROPERTY_ID && r.fromEntity.id === factClaimId && r.toEntity.id === draft.debateEntityId
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
    const draft = buildDebatePublishDraft(
      baseInput({ claims: [{ text: 'Unclassified claim', isFactual: null, turnIndex: 0 }] }),
      {
        createEntityId: idFactory(),
        createPosition: () => 'a0',
      }
    );
    const claimId = claimIdByName(draft, 'Unclassified claim');
    expect(claimId).toBeTruthy();
    expect(draft.values.some(v => v.entity.id === claimId && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID)).toBe(
      false
    );
  });

  it('references an existing Claim instead of minting one when geo-chat matched it', () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          {
            text: 'The burden to obtain an ID for voting may be too high.',
            isFactual: false,
            turnIndex: 0,
            existingClaimEntityId: EXISTING,
          },
          { text: 'A novel point.', isFactual: true, turnIndex: 1 },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );

    // Nothing is written on the existing entity: no Name, no Types, no Is factual — an entity we did
    // not create keeps its own facts even where this extraction disagrees.
    expect(draft.values.some(v => v.entity.id === EXISTING)).toBe(false);
    expect(draft.relations.some(r => r.fromEntity.id === EXISTING && r.type.id === TYPES_PROPERTY_ID)).toBe(false);
    // Only the novel claim is minted.
    expect(
      draft.relations.filter(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID)
    ).toHaveLength(1);
    // The speaker's block links to the existing claim, which gains this debate as a source.
    expect(blockAuthoringClaim(draft, EXISTING)).toBe(YES_SPACE);
    expect(
      draft.relations.some(
        r => r.type.id === SOURCES_PROPERTY_ID && r.fromEntity.id === EXISTING && r.toEntity.id === draft.debateEntityId
      )
    ).toBe(true);
    // The novel claim is minted and attributed as before.
    expect(blockAuthoringClaim(draft, claimIdByName(draft, 'A novel point.'))).toBe(NO_SPACE);
  });

  it('adds Topics relations on minted and reused claims, deduped per claim and topic', () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const TOPIC = { id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' };
    const OTHER = { id: '3f2044d6609746cd964da85414f7ba63', name: 'Morning routine' };
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          { text: 'A novel point.', isFactual: true, turnIndex: 0, topics: [TOPIC, OTHER] },
          // The same reused entity appears behind both debaters' restatements with the same
          // topic: one relation, not two. (Topics the entity already carries on the graph were
          // subtracted upstream by the reuse policy.)
          {
            text: 'A restated point.',
            isFactual: null,
            turnIndex: 0,
            existingClaimEntityId: EXISTING,
            topics: [TOPIC],
          },
          { text: 'Restated again.', isFactual: null, turnIndex: 1, existingClaimEntityId: EXISTING, topics: [TOPIC] },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    const topicRelations = draft.relations.filter(r => r.type.id === TOPICS_PROPERTY_ID);
    const mintedId = claimIdByName(draft, 'A novel point.');
    expect(topicRelations.map(r => `${r.fromEntity.id}->${r.toEntity.id}`).sort()).toEqual(
      [`${mintedId}->${TOPIC.id}`, `${mintedId}->${OTHER.id}`, `${EXISTING}->${TOPIC.id}`].sort()
    );
    expect(topicRelations.find(r => r.fromEntity.id === EXISTING)?.toEntity.name).toBe(TOPIC.name);
  });

  it('tags only contestable claims as Debate, minted or reused, once per entity', () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          { text: 'A broad position.', isFactual: false, turnIndex: 0, isContestable: true },
          // Narrowly verifiable: still published as a Claim, just not offered as a motion.
          { text: 'A narrow fact.', isFactual: true, turnIndex: 0, isContestable: false },
          // The same reused entity behind two restatements gets one tag, not two.
          {
            text: 'Restated once.',
            isFactual: null,
            turnIndex: 1,
            existingClaimEntityId: EXISTING,
            isContestable: true,
          },
          {
            text: 'Restated twice.',
            isFactual: null,
            turnIndex: 1,
            existingClaimEntityId: EXISTING,
            isContestable: true,
          },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    const tags = draft.relations.filter(r => r.type.id === TAG_PROPERTY_ID);
    expect(tags.map(r => r.fromEntity.id).sort()).toEqual([claimIdByName(draft, 'A broad position.'), EXISTING].sort());
    expect(tags.every(r => r.toEntity.id === DEBATE_TAG_ID)).toBe(true);
    // The narrow claim is still published as a Claim, it just carries no Debate tag.
    expect(claimIdByName(draft, 'A narrow fact.')).toBeTruthy();
  });

  it('tags one motion when a proposition is extracted twice and matched to nothing', () => {
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          // Both mint their own entity (long-standing behaviour), but a fresh id per
          // claim means an id-keyed dedupe would never fire — two rival motions.
          { text: 'AI chatbots are effective therapy.', isFactual: false, turnIndex: 0, isContestable: true },
          { text: 'AI chatbots are effective therapy.', isFactual: false, turnIndex: 1, isContestable: true },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    expect(draft.relations.filter(r => r.type.id === TAG_PROPERTY_ID)).toHaveLength(1);
  });

  it('treats dashed and dashless forms of one topic as a single relation', () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          {
            text: 'Restated once.',
            isFactual: null,
            turnIndex: 0,
            existingClaimEntityId: EXISTING,
            topics: [{ id: '27b73193-ecea-48fd-aa46-fdee40c0b717', name: 'AI and mental health' }],
          },
          {
            text: 'Restated twice.',
            isFactual: null,
            turnIndex: 1,
            existingClaimEntityId: EXISTING,
            topics: [{ id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' }],
          },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    expect(draft.relations.filter(r => r.type.id === TOPICS_PROPERTY_ID)).toHaveLength(1);
  });

  it('writes each relation once when several claims resolve to the same existing entity', () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          // Both debaters restate the same published point, and one restates it twice in a turn.
          { text: 'Same point, yes side.', isFactual: null, turnIndex: 0, existingClaimEntityId: EXISTING },
          { text: 'Same point again, yes side.', isFactual: null, turnIndex: 0, existingClaimEntityId: EXISTING },
          { text: 'Same point, no side.', isFactual: null, turnIndex: 1, existingClaimEntityId: EXISTING },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    const sources = draft.relations.filter(r => r.type.id === SOURCES_PROPERTY_ID && r.fromEntity.id === EXISTING);
    expect(sources).toHaveLength(1);
    expect(sources[0].toEntity.id).toBe(draft.debateEntityId);
    const blockLinks = draft.relations.filter(
      r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === EXISTING
    );
    // One Claims edge per block, not per extracted claim.
    expect(blockLinks).toHaveLength(2);
    expect(new Set(blockLinks.map(r => r.fromEntity.id)).size).toBe(2);
  });

  it('mints a fresh Claim when the existing id is blank or null', () => {
    const draft = buildDebatePublishDraft(
      baseInput({
        claims: [
          { text: 'Blank reference', isFactual: null, turnIndex: 0, existingClaimEntityId: '   ' },
          { text: 'Null reference', isFactual: null, turnIndex: 0, existingClaimEntityId: null },
        ],
      }),
      { createEntityId: idFactory(), createPosition: () => 'a0' }
    );
    expect(claimIdByName(draft, 'Blank reference')).toBeTruthy();
    expect(claimIdByName(draft, 'Null reference')).toBeTruthy();
    expect(
      draft.relations.filter(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID)
    ).toHaveLength(2);
  });

  it('a reused claim survives the real publish pipeline as relations only', async () => {
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    // Real entity ids: the op pipeline validates them, unlike the draft-only tests above. Ids are
    // encoded as bytes in ops, so the two drafts are compared by op shape rather than by id.
    const claim = { text: 'Reused claim', isFactual: true, turnIndex: 0 };
    const minted = buildDebatePublishDraft(baseInput({ claims: [claim] }), { createEntityId: ID.createEntityId });
    const reused = buildDebatePublishDraft(baseInput({ claims: [{ ...claim, existingClaimEntityId: EXISTING }] }), {
      createEntityId: ID.createEntityId,
    });
    const mintedOps = await Effect.runPromise(
      Publish.prepareLocalDataForPublishing(minted.values, minted.relations, SPACE)
    );
    const reusedOps = await Effect.runPromise(
      Publish.prepareLocalDataForPublishing(reused.values, reused.relations, SPACE)
    );
    const relationOps = (ops: typeof mintedOps) => ops.filter(op => op.type === 'createRelation').length;
    const otherOps = (ops: typeof mintedOps) => ops.filter(op => op.type !== 'createRelation').length;

    expect(reusedOps.length).toBeGreaterThan(0);
    // Reuse drops exactly the Types relation and every value op on the claim (Name, Is factual);
    // the block→Claims and claim→Sources relations are still there.
    expect(relationOps(reusedOps)).toBe(relationOps(mintedOps) - 1);
    expect(otherOps(reusedOps)).toBeLessThan(otherOps(mintedOps));
  });

  describe("geo-chat's stable claim ids (GEO-2870 D1)", () => {
    const STABLE = '5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b';
    const OTHER_STABLE = '6a2b3c4d5e6f40718293a4b5c6d7e8f9';
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';

    it("mints an unmatched claim under geo-chat's id instead of a fresh one", () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            { text: 'A novel point.', isFactual: true, turnIndex: 0, stableEntityId: STABLE, isContestable: true },
          ],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      expect(claimIdByName(draft, 'A novel point.')).toBe(STABLE);
      expect(
        draft.relations.some(
          r => r.fromEntity.id === STABLE && r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID
        )
      ).toBe(true);
      expect(
        draft.values.find(v => v.entity.id === STABLE && v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID)?.value
      ).toBe('true');
      expect(blockAuthoringClaim(draft, STABLE)).toBe(YES_SPACE);
      expect(draft.relations.some(r => r.fromEntity.id === STABLE && r.type.id === TAG_PROPERTY_ID)).toBe(true);
    });

    it('lets an existing entity win over the stable id, which then goes unused', () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            {
              text: 'Matched after all.',
              isFactual: true,
              turnIndex: 0,
              existingClaimEntityId: EXISTING,
              stableEntityId: STABLE,
            },
          ],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      expect(blockAuthoringClaim(draft, EXISTING)).toBe(YES_SPACE);
      expect(draft.values.some(v => v.entity.id === EXISTING)).toBe(false);
      expect(draft.values.some(v => v.entity.id === STABLE)).toBe(false);
      expect(draft.relations.some(r => r.fromEntity.id === STABLE || r.toEntity.id === STABLE)).toBe(false);
    });

    it('mints a claim stated in two turns once, and links both statements to it', () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            { text: 'Same point.', isFactual: true, turnIndex: 0, stableEntityId: STABLE, isContestable: true },
            { text: 'same point', isFactual: false, turnIndex: 1, stableEntityId: STABLE, isContestable: true },
          ],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      const on = (propertyId: string) =>
        draft.values.filter(v => v.entity.id === STABLE && v.property.id === propertyId);
      expect(on(NAME_PROPERTY_ID).map(v => v.value)).toEqual(['Same point.']);
      expect(on(CLAIM_IS_FACTUAL_PROPERTY_ID)).toHaveLength(1);
      const from = (propertyId: string) =>
        draft.relations.filter(r => r.fromEntity.id === STABLE && r.type.id === propertyId);
      expect(from(TYPES_PROPERTY_ID)).toHaveLength(1);
      expect(from(TAG_PROPERTY_ID)).toHaveLength(1);
      expect(from(SOURCES_PROPERTY_ID)).toHaveLength(1);
      const statements = draft.relations.filter(
        r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === STABLE
      );
      expect(statements).toHaveLength(2);
    });

    it('keeps two different stable ids as two claims, and mints a fresh id where there is none', () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            { text: 'First.', isFactual: null, turnIndex: 0, stableEntityId: STABLE },
            { text: 'Second.', isFactual: null, turnIndex: 1, stableEntityId: OTHER_STABLE },
            { text: 'Older payload.', isFactual: null, turnIndex: 1, stableEntityId: null },
          ],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      expect(claimIdByName(draft, 'First.')).toBe(STABLE);
      expect(claimIdByName(draft, 'Second.')).toBe(OTHER_STABLE);
      const fresh = claimIdByName(draft, 'Older payload.');
      expect(fresh).toBeTruthy();
      expect([STABLE, OTHER_STABLE]).not.toContain(fresh);
    });

    it('publishes the claim under the same id however many times the draft is rebuilt', async () => {
      // The sweep only publishes a debate whose Debate entity is absent, and a rebuilt draft (a
      // retried sweep) now names the claim exactly as the first one did — and as geo-chat did.
      const input = baseInput({ claims: [{ text: 'Stable.', isFactual: true, turnIndex: 0, stableEntityId: STABLE }] });
      const first = buildDebatePublishDraft(input, { createEntityId: ID.createEntityId });
      const second = buildDebatePublishDraft(input, { createEntityId: ID.createEntityId });
      expect(claimIdByName(first, 'Stable.')).toBe(STABLE);
      expect(claimIdByName(second, 'Stable.')).toBe(STABLE);
      const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(first.values, first.relations, SPACE));
      expect(ops.length).toBeGreaterThan(0);
    });
  });

  describe('early claims publish (GEO-2870 option A)', () => {
    const STABLE = '5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b';
    const OTHER_STABLE = '6a2b3c4d5e6f40718293a4b5c6d7e8f9';
    const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
    const TOPIC = 'dddddddddddddddddddddddddddddddd';

    const claims = [
      {
        text: 'Same point.',
        isFactual: true,
        turnIndex: 0,
        stableEntityId: STABLE,
        isContestable: true,
        topics: [{ id: TOPIC, name: 'Foreign policy' }],
      },
      { text: 'same point', isFactual: false, turnIndex: 1, stableEntityId: STABLE, isContestable: true },
      { text: 'Another point.', isFactual: null, turnIndex: 1, stableEntityId: OTHER_STABLE },
      { text: 'Matched.', isFactual: true, turnIndex: 0, existingClaimEntityId: EXISTING, stableEntityId: null },
      { text: 'Older payload.', isFactual: null, turnIndex: 0, stableEntityId: null },
    ];
    const input = baseInput({ claims });
    const early = () =>
      buildDebateClaimsDraft(
        { spaceId: SPACE, transcriptTurns: input.transcriptTurns, claims },
        {
          createPosition: () => 'a0',
        }
      );

    it('derives relation ids from their endpoints, the same every time and different per edge', () => {
      const a = stableClaimRelationIds(STABLE, TYPES_PROPERTY_ID, CLAIM_TYPE_ID);
      expect(stableClaimRelationIds(STABLE, TYPES_PROPERTY_ID, CLAIM_TYPE_ID)).toEqual(a);
      // Dashed or dashless, the same edge.
      expect(stableClaimRelationIds(ID.hexToUuid(STABLE), TYPES_PROPERTY_ID, CLAIM_TYPE_ID)).toEqual(a);
      expect(a.id).toMatch(/^[0-9a-f]{32}$/);
      expect(a.entityId).toMatch(/^[0-9a-f]{32}$/);
      expect(a.id).not.toBe(a.entityId);
      expect(stableClaimRelationIds(STABLE, TAG_PROPERTY_ID, DEBATE_TAG_ID).id).not.toBe(a.id);
      expect(stableClaimRelationIds(OTHER_STABLE, TYPES_PROPERTY_ID, CLAIM_TYPE_ID).id).not.toBe(a.id);
    });

    it('writes only the claims minted under a stable id, each once, under its first statement', () => {
      const draft = early();
      expect(draft.claimIds).toEqual([STABLE, OTHER_STABLE]);
      expect(draft.firstClaimText).toBe('Same point.');
      const names = draft.values.filter(v => v.property.id === NAME_PROPERTY_ID).map(v => [v.entity.id, v.value]);
      expect(names).toEqual([
        [STABLE, 'Same point.'],
        [OTHER_STABLE, 'Another point.'],
      ]);
      expect(draft.values.some(v => v.entity.id === EXISTING)).toBe(false);
      expect(draft.values.some(v => v.value === 'Older payload.')).toBe(false);
      const from = (id: string, propertyId: string) =>
        draft.relations.filter(r => r.fromEntity.id === id && r.type.id === propertyId);
      expect(from(STABLE, TYPES_PROPERTY_ID)).toHaveLength(1);
      expect(from(STABLE, TAG_PROPERTY_ID)).toHaveLength(1);
      expect(from(STABLE, TOPICS_PROPERTY_ID).map(r => r.toEntity.id)).toEqual([TOPIC]);
      expect(from(OTHER_STABLE, TAG_PROPERTY_ID)).toHaveLength(0);
    });

    it('writes nothing that names the debate, so the full publish still sees it unpublished', () => {
      const draft = early();
      const debateEntityId = ID.uuidToHex(input.debateId);
      expect(draft.relations.some(r => r.toEntity.id === debateEntityId || r.fromEntity.id === debateEntityId)).toBe(
        false
      );
      expect(draft.values.some(v => v.entity.id === debateEntityId)).toBe(false);
      expect(draft.relations.some(r => r.type.id === SOURCES_PROPERTY_ID)).toBe(false);
      expect(draft.relations.some(r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID)).toBe(false);
    });

    it('is a subset of the full publish — same relation ids, same values — so publishing both duplicates nothing', () => {
      const draft = early();
      // Two full drafts with independent random ids: the claim-describing relations still agree.
      for (const full of [
        buildDebatePublishDraft(input, { createEntityId: ID.createEntityId }),
        buildDebatePublishDraft(input, { createEntityId: ID.createEntityId }),
      ]) {
        const fullRelations = new Map(full.relations.map(r => [r.id, r]));
        for (const relation of draft.relations) {
          const match = fullRelations.get(relation.id);
          expect(match, `${relation.type.id} from ${relation.fromEntity.id}`).toBeDefined();
          expect(match?.entityId).toBe(relation.entityId);
          expect(match?.fromEntity.id).toBe(relation.fromEntity.id);
          expect(match?.toEntity.id).toBe(relation.toEntity.id);
        }
        const fullValues = new Map(full.values.map(v => [v.id, v.value]));
        for (const value of draft.values) expect(fullValues.get(value.id)).toBe(value.value);
      }
    });

    it('gives the full publish the same Sources edge on every rebuild, so a rerun cannot add a second', () => {
      const sources = (draft: ReturnType<typeof buildDebatePublishDraft>) =>
        draft.relations.filter(r => r.fromEntity.id === STABLE && r.type.id === SOURCES_PROPERTY_ID).map(r => r.id);
      const first = sources(buildDebatePublishDraft(input, { createEntityId: ID.createEntityId }));
      expect(first).toHaveLength(1);
      expect(sources(buildDebatePublishDraft(input, { createEntityId: ID.createEntityId }))).toEqual(first);
    });

    it('skips a claim whose turn is blank or missing, as the full publish does', () => {
      const draft = buildDebateClaimsDraft({
        spaceId: SPACE,
        transcriptTurns: [{ turnIndex: 0, speakerSpaceEntityId: YES_SPACE, speakerName: 'A', text: '   ' }],
        claims: [
          { text: 'On a blank turn.', isFactual: null, turnIndex: 0, stableEntityId: STABLE },
          { text: 'On no turn.', isFactual: null, turnIndex: 7, stableEntityId: OTHER_STABLE },
        ],
      });
      expect(draft.claimIds).toEqual([]);
      expect(draft.values).toEqual([]);
      expect(draft.relations).toEqual([]);
    });

    it('prepares into ops', async () => {
      const draft = early();
      const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, SPACE));
      expect(ops.length).toBeGreaterThan(0);
    });
  });

  it('mints no Claim entities when no claims are provided (backwards compatible)', () => {
    const draft = buildDebatePublishDraft(baseInput(), { createEntityId: idFactory(), createPosition: () => 'a0' });
    expect(draft.relations.some(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID)).toBe(false);
  });

  it('drops a claim whose turnIndex has no matching turn', () => {
    const draft = buildDebatePublishDraft(
      baseInput({ claims: [{ text: 'Ghost claim', isFactual: true, turnIndex: 5 }] }),
      {
        createEntityId: idFactory(),
        createPosition: () => 'a0',
      }
    );
    expect(draft.values.some(v => v.value === 'Ghost claim')).toBe(false);
  });

  describe('claim timecodes (GEO-2958)', () => {
    const statementOf = (draft: ReturnType<typeof buildDebatePublishDraft>, claimText: string) => {
      const claimId = claimIdByName(draft, claimText);
      const statements = draft.relations.filter(
        r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === claimId
      );
      expect(statements).toHaveLength(1);
      return statements[0].entityId;
    };
    const offsetsOn = (draft: ReturnType<typeof buildDebatePublishDraft>, entityId: string) =>
      draft.values
        .filter(v => v.entity.id === entityId)
        .map(v => ({ property: v.property.id, dataType: v.property.dataType, value: v.value }));
    const relationsFrom = (draft: ReturnType<typeof buildDebatePublishDraft>, entityId: string) =>
      draft.relations.filter(r => r.fromEntity.id === entityId).map(r => [r.type.id, r.toEntity.id]);

    it('writes a measured span onto the block → claim relation entity, typed as a Selector on the video', () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [{ text: 'Timed claim', isFactual: false, turnIndex: 0, timing: { startMs: 16_680, endMs: 21_900 } }],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      const statement = statementOf(draft, 'Timed claim');

      // The hand-published shape: two Integer values and two relations on the relation's entity —
      // not on the claim, which can be said in two turns, and not on the block.
      expect(offsetsOn(draft, statement)).toEqual([
        { property: CLAIM_START_OFFSET_PROPERTY_ID, dataType: 'INTEGER', value: '16680' },
        { property: CLAIM_END_OFFSET_PROPERTY_ID, dataType: 'INTEGER', value: '21900' },
      ]);
      expect(relationsFrom(draft, statement)).toEqual([
        [TYPES_PROPERTY_ID, SELECTOR_TYPE_ID],
        [TARGET_PROPERTY_ID, DEBATE_VIDEOS_PROPERTY_ID],
      ]);
      const claimId = claimIdByName(draft, 'Timed claim');
      expect(
        draft.values.some(
          v =>
            v.entity.id === claimId &&
            (v.property.id === CLAIM_START_OFFSET_PROPERTY_ID || v.property.id === CLAIM_END_OFFSET_PROPERTY_ID)
        )
      ).toBe(false);
    });

    // Each of these would be published as a to-the-second certainty the app cannot demote.
    it.each([
      ['no timing', undefined],
      ['a null timing', null],
      ['an end at the start', { startMs: 5_000, endMs: 5_000 }],
      ['an end before the start', { startMs: 5_000, endMs: 4_000 }],
      ['a negative start', { startMs: -1, endMs: 4_000 }],
      ['a fractional value', { startMs: 1_000.5, endMs: 4_000 }],
      ['a non-finite value', { startMs: 1_000, endMs: Number.POSITIVE_INFINITY }],
    ])('writes nothing on the relation entity for %s', (_label, timing) => {
      const draft = buildDebatePublishDraft(
        baseInput({ claims: [{ text: 'Untimed claim', isFactual: false, turnIndex: 0, timing }] }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      const statement = statementOf(draft, 'Untimed claim');
      expect(offsetsOn(draft, statement)).toEqual([]);
      expect(relationsFrom(draft, statement)).toEqual([]);
    });

    it('times each statement of a reused claim on its own block', () => {
      const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            {
              text: 'Said by both',
              isFactual: false,
              turnIndex: 0,
              existingClaimEntityId: EXISTING,
              timing: { startMs: 1_000, endMs: 9_000 },
            },
            {
              text: 'Said by both',
              isFactual: false,
              turnIndex: 1,
              existingClaimEntityId: EXISTING,
              timing: { startMs: 61_000, endMs: 70_000 },
            },
          ],
        }),
        { createEntityId: idFactory(), createPosition: () => 'a0' }
      );
      const statements = draft.relations.filter(
        r => r.type.id === DEBATE_CLAIMS_PROPERTY_ID && r.toEntity.id === EXISTING
      );
      expect(statements).toHaveLength(2);
      expect(statements.map(r => offsetsOn(draft, r.entityId).map(v => v.value))).toEqual([
        ['1000', '9000'],
        ['61000', '70000'],
      ]);
      // Still nothing written onto the entity we did not create.
      expect(draft.values.some(v => v.entity.id === EXISTING)).toBe(false);
    });

    it('survives the real publish pipeline as integer values on the relation entity', async () => {
      const draft = buildDebatePublishDraft(
        baseInput({
          claims: [
            { text: 'Timed claim', isFactual: true, turnIndex: 0, timing: { startMs: 134_600, endMs: 143_140 } },
          ],
        }),
        { createEntityId: ID.createEntityId }
      );
      const statement = statementOf(draft, 'Timed claim');
      const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, SPACE));
      const serialized = JSON.stringify(ops, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
      expect(serialized).toContain('134600');
      expect(serialized).toContain('143140');
      expect(ops.length).toBeGreaterThan(0);
      expect(statement).toBeTruthy();
    });
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
