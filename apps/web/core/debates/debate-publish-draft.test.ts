import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { ID } from '~/core/id';
import { Publish } from '~/core/utils/publish';

import {
  type DebatePublishInput,
  buildDebatePublishDraft,
  mergeTranscriptSegmentsIntoTurns,
} from './debate-publish-draft';
import {
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
  TRANSCRIPT_TYPE_ID,
  TYPES_PROPERTY_ID,
  VIDEO_TYPE_ID,
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
    videoUrl: 'https://cdn.example/final.mp4',
    transcriptTurns: [
      { speakerSpaceEntityId: YES_SPACE, speakerName: 'Arturas', text: 'Iran was building a nuke.' },
      { speakerSpaceEntityId: NO_SPACE, speakerName: 'Preston', text: 'There was no congressional approval.' },
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
