import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Relation } from '~/core/types';

import {
  ANSWERS_PROPERTY_ID,
  ANSWER_TYPE_ID,
  CANONICAL_ANSWERS,
  QUESTION_TYPE_ID,
  RELATED_PEOPLE_PROPERTY_ID,
  RELATED_PROJECTS_PROPERTY_ID,
  TOPICS_PROPERTY_ID,
} from './ontology';

export type QuestionDraftSelection = {
  id: string;
  name: string | null;
};

export type BuildQuestionDraftInput = {
  spaceId: string;
  questionText: string;
  answerLabels: [string, string];
  topics?: QuestionDraftSelection[];
  relatedPeople?: QuestionDraftSelection[];
  relatedProjects?: QuestionDraftSelection[];
};

export type QuestionDraft = {
  questionId: string;
  names: Array<{ entityId: string; spaceId: string; value: string }>;
  relations: Relation[];
};

type BuildQuestionDraftOptions = {
  createEntityId?: () => string;
  createPosition?: () => string;
};

type ResolvedAnswer = {
  id: string;
  label: string;
};

const canonicalAnswerByNormalizedLabel = new Map(
  CANONICAL_ANSWERS.map(answer => [normalizeAnswerLabel(answer.label), answer])
);

export function normalizeAnswerLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveCanonicalAnswer(label: string): (typeof CANONICAL_ANSWERS)[number] | null {
  return canonicalAnswerByNormalizedLabel.get(normalizeAnswerLabel(label)) ?? null;
}

export function buildQuestionDraft(
  input: BuildQuestionDraftInput,
  options: BuildQuestionDraftOptions = {}
): QuestionDraft {
  const createEntityId = options.createEntityId ?? ID.createEntityId;
  const createPosition = options.createPosition ?? Position.generate;
  const questionText = input.questionText.trim();
  const answerLabels = input.answerLabels.map(label => label.trim()) as [string, string];

  if (questionText.length === 0) {
    throw new Error('Question text is required.');
  }

  if (answerLabels.some(label => label.length === 0)) {
    throw new Error('Two answer labels are required.');
  }

  const normalizedAnswerLabels = answerLabels.map(normalizeAnswerLabel);
  if (new Set(normalizedAnswerLabels).size !== normalizedAnswerLabels.length) {
    throw new Error('Answer labels must be different.');
  }

  const questionId = createEntityId();
  const names: QuestionDraft['names'] = [{ entityId: questionId, spaceId: input.spaceId, value: questionText }];
  const relations: Relation[] = [];

  const makeRelation = ({
    fromEntityId,
    fromEntityName,
    propertyId,
    propertyName,
    toEntityId,
    toEntityName,
  }: {
    fromEntityId: string;
    fromEntityName: string | null;
    propertyId: string;
    propertyName: string;
    toEntityId: string;
    toEntityName: string | null;
  }): Relation => ({
    id: createEntityId(),
    entityId: createEntityId(),
    spaceId: input.spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: createPosition(),
    type: {
      id: propertyId,
      name: propertyName,
    },
    fromEntity: {
      id: fromEntityId,
      name: fromEntityName,
    },
    toEntity: {
      id: toEntityId,
      name: toEntityName,
      value: toEntityId,
    },
  });

  const addQuestionRelation = (propertyId: string, propertyName: string, selection: QuestionDraftSelection) => {
    relations.push(
      makeRelation({
        fromEntityId: questionId,
        fromEntityName: questionText,
        propertyId,
        propertyName,
        toEntityId: selection.id,
        toEntityName: selection.name,
      })
    );
  };

  relations.push(
    makeRelation({
      fromEntityId: questionId,
      fromEntityName: questionText,
      propertyId: SystemIds.TYPES_PROPERTY,
      propertyName: 'Types',
      toEntityId: QUESTION_TYPE_ID,
      toEntityName: 'Question',
    })
  );

  const answers = answerLabels.map(label => {
    const canonical = resolveCanonicalAnswer(label);

    if (canonical) {
      return {
        id: canonical.id,
        label: canonical.label,
      };
    }

    const answerId = createEntityId();
    names.push({ entityId: answerId, spaceId: input.spaceId, value: label });
    relations.push(
      makeRelation({
        fromEntityId: answerId,
        fromEntityName: label,
        propertyId: SystemIds.TYPES_PROPERTY,
        propertyName: 'Types',
        toEntityId: ANSWER_TYPE_ID,
        toEntityName: 'Answer',
      })
    );

    return {
      id: answerId,
      label,
    };
  }) satisfies ResolvedAnswer[];

  for (const answer of answers) {
    addQuestionRelation(ANSWERS_PROPERTY_ID, 'Answers', {
      id: answer.id,
      name: answer.label,
    });
  }

  for (const topic of input.topics ?? []) {
    addQuestionRelation(TOPICS_PROPERTY_ID, 'Topics', topic);
  }

  for (const person of input.relatedPeople ?? []) {
    addQuestionRelation(RELATED_PEOPLE_PROPERTY_ID, 'Related people', person);
  }

  for (const project of input.relatedProjects ?? []) {
    addQuestionRelation(RELATED_PROJECTS_PROPERTY_ID, 'Related projects', project);
  }

  return { questionId, names, relations };
}
