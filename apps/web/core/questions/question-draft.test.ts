import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import {
  ANSWERS_PROPERTY_ID,
  ANSWER_TYPE_ID,
  QUESTION_TYPE_ID,
  RELATED_PEOPLE_PROPERTY_ID,
  RELATED_PROJECTS_PROPERTY_ID,
  TOPICS_PROPERTY_ID,
} from './ontology';
import { buildQuestionDraft, normalizeAnswerLabel, resolveCanonicalAnswer } from './question-draft';

function makeIdFactory() {
  let index = 0;
  return () => `id-${++index}`;
}

function makePositionFactory() {
  let index = 0;
  return () => `pos-${++index}`;
}

describe('question draft helpers', () => {
  it('normalizes answer labels for canonical matching', () => {
    expect(normalizeAnswerLabel('  YES  ')).toBe('yes');
    expect(normalizeAnswerLabel('For   now')).toBe('for now');
    expect(resolveCanonicalAnswer(' yes ')?.id).toBe('41b02171457c433d8ecdb0e8d628a9a9');
    expect(resolveCanonicalAnswer('custom')).toBeNull();
  });

  it('creates a question name and Question type relation', () => {
    const draft = buildQuestionDraft(
      {
        spaceId: 'space-1',
        questionText: 'Should we publish this?',
        answerLabels: ['Yes', 'No'],
      },
      { createEntityId: makeIdFactory(), createPosition: makePositionFactory() }
    );

    expect(draft.questionId).toBe('id-1');
    expect(draft.names).toEqual([
      { entityId: 'id-1', spaceId: 'space-1', value: 'Should we publish this?' },
    ]);
    expect(draft.relations[0]).toMatchObject({
      id: 'id-2',
      entityId: 'id-3',
      spaceId: 'space-1',
      position: 'pos-1',
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: 'id-1', name: 'Should we publish this?' },
      toEntity: { id: QUESTION_TYPE_ID, name: 'Question', value: QUESTION_TYPE_ID },
    });
  });

  it('links canonical answers without creating duplicate Answer entities', () => {
    const draft = buildQuestionDraft(
      {
        spaceId: 'space-1',
        questionText: 'Ship it?',
        answerLabels: ['For', 'Against'],
      },
      { createEntityId: makeIdFactory(), createPosition: makePositionFactory() }
    );

    const answerRelations = draft.relations.filter(relation => relation.type.id === ANSWERS_PROPERTY_ID);
    const answerTypeRelations = draft.relations.filter(
      relation => relation.type.id === SystemIds.TYPES_PROPERTY && relation.toEntity.id === ANSWER_TYPE_ID
    );

    expect(draft.names).toEqual([{ entityId: 'id-1', spaceId: 'space-1', value: 'Ship it?' }]);
    expect(answerTypeRelations).toEqual([]);
    expect(answerRelations.map(relation => relation.toEntity)).toEqual([
      { id: '507d409bed0c4539ba61dddb8e2a8591', name: 'For', value: '507d409bed0c4539ba61dddb8e2a8591' },
      {
        id: '3423179a222148eabaf9352efc93660a',
        name: 'Against',
        value: '3423179a222148eabaf9352efc93660a',
      },
    ]);
  });

  it('creates custom Answer entities with Answer type relations', () => {
    const draft = buildQuestionDraft(
      {
        spaceId: 'space-1',
        questionText: 'Choose a path?',
        answerLabels: ['Path A', 'Path B'],
      },
      { createEntityId: makeIdFactory(), createPosition: makePositionFactory() }
    );

    expect(draft.names).toEqual([
      { entityId: 'id-1', spaceId: 'space-1', value: 'Choose a path?' },
      { entityId: 'id-4', spaceId: 'space-1', value: 'Path A' },
      { entityId: 'id-7', spaceId: 'space-1', value: 'Path B' },
    ]);

    const answerTypeRelations = draft.relations.filter(
      relation => relation.type.id === SystemIds.TYPES_PROPERTY && relation.toEntity.id === ANSWER_TYPE_ID
    );
    expect(answerTypeRelations.map(relation => relation.fromEntity)).toEqual([
      { id: 'id-4', name: 'Path A' },
      { id: 'id-7', name: 'Path B' },
    ]);

    const answerRelations = draft.relations.filter(relation => relation.type.id === ANSWERS_PROPERTY_ID);
    expect(answerRelations.map(relation => relation.toEntity)).toEqual([
      { id: 'id-4', name: 'Path A', value: 'id-4' },
      { id: 'id-7', name: 'Path B', value: 'id-7' },
    ]);
  });

  it('rejects empty question text and answer labels', () => {
    expect(() =>
      buildQuestionDraft({
        spaceId: 'space-1',
        questionText: '   ',
        answerLabels: ['Yes', 'No'],
      })
    ).toThrow('Question text is required.');

    expect(() =>
      buildQuestionDraft({
        spaceId: 'space-1',
        questionText: 'Ready?',
        answerLabels: ['Yes', '   '],
      })
    ).toThrow('Two answer labels are required.');
  });

  it('rejects duplicate answer labels after normalization', () => {
    expect(() =>
      buildQuestionDraft({
        spaceId: 'space-1',
        questionText: 'Ready?',
        answerLabels: ['Yes', ' yes '],
      })
    ).toThrow('Answer labels must be different.');

    expect(() =>
      buildQuestionDraft({
        spaceId: 'space-1',
        questionText: 'Choose one?',
        answerLabels: ['Path A', 'path   a'],
      })
    ).toThrow('Answer labels must be different.');
  });

  it('links optional topic, person, and project relations', () => {
    const draft = buildQuestionDraft(
      {
        spaceId: 'space-1',
        questionText: 'Who owns launch?',
        answerLabels: ['Yes', 'No'],
        topics: [{ id: 'topic-1', name: 'Launch' }],
        relatedPeople: [{ id: 'person-1', name: 'Ada' }],
        relatedProjects: [{ id: 'project-1', name: 'Website' }],
      },
      { createEntityId: makeIdFactory(), createPosition: makePositionFactory() }
    );

    expect(draft.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: { id: TOPICS_PROPERTY_ID, name: 'Topics' },
          toEntity: { id: 'topic-1', name: 'Launch', value: 'topic-1' },
        }),
        expect.objectContaining({
          type: { id: RELATED_PEOPLE_PROPERTY_ID, name: 'Related people' },
          toEntity: { id: 'person-1', name: 'Ada', value: 'person-1' },
        }),
        expect.objectContaining({
          type: { id: RELATED_PROJECTS_PROPERTY_ID, name: 'Related projects' },
          toEntity: { id: 'project-1', name: 'Website', value: 'project-1' },
        }),
      ])
    );
  });
});
