'use client';

import * as React from 'react';

import { keepPreviousData } from '@tanstack/react-query';
import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { Button } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { SelectEntityCompact, type SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { Text } from '~/design-system/text';

import type { DebateQuestion, DebateSide } from '~/core/debates/api';
import {
  oppositeSide,
  useAcceptDebateMatch,
  useDebateQuestions,
  useDeclineDebateMatch,
  useJoinDebateQueue,
} from '~/core/debates/hooks';
import { buildQuestionDraft } from '~/core/questions/question-draft';
import {
  ANSWERS_PROPERTY_ID,
  PERSON_TYPE_ID,
  PROJECT_TYPE_ID,
  QUESTION_TYPE_ID,
  RELATED_PEOPLE_PROPERTY_ID,
  RELATED_PROJECTS_PROPERTY_ID,
  TOPICS_PROPERTY_ID,
  TOPIC_TYPE_ID,
} from '~/core/questions/ontology';
import { useDiff } from '~/core/state/diff-store';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';

type QuestionsPageClientProps = {
  spaceId: string;
};

type RelatedSelectionKey = 'topics' | 'relatedPeople' | 'relatedProjects';

type RelatedField = {
  key: RelatedSelectionKey;
  label: string;
  placeholder: string;
  typeId: string;
};

const relatedFields: RelatedField[] = [
  {
    key: 'topics',
    label: 'Topics',
    placeholder: 'Search topics...',
    typeId: TOPIC_TYPE_ID,
  },
  {
    key: 'relatedPeople',
    label: 'Related people',
    placeholder: 'Search people...',
    typeId: PERSON_TYPE_ID,
  },
  {
    key: 'relatedProjects',
    label: 'Related projects',
    placeholder: 'Search projects...',
    typeId: PROJECT_TYPE_ID,
  },
];

export function QuestionsPageClient({ spaceId }: QuestionsPageClientProps) {
  const questionsTabEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!questionsTabEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [questionsTabEnabled, router, spaceId]);

  if (!questionsTabEnabled) return null;

  return <QuestionsTabSurface spaceId={spaceId} />;
}

function QuestionsTabSurface({ spaceId }: QuestionsPageClientProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const debatesTabEnabled = useFeatureFlag('debatesTab');
  const { entities: questions, isLoading } = useQueryEntities({
    where: {
      spaces: [{ equals: spaceId }],
      types: [{ id: { equals: QUESTION_TYPE_ID } }],
    },
    first: 50,
    placeholderData: keepPreviousData,
    includeUnpublishedLocal: true,
  });
  const publishedQuestionIds = React.useMemo(
    () => questions.filter(isQuestionPublished).map(question => question.id),
    [questions]
  );
  const debateQuestionsQuery = useDebateQuestions(spaceId, publishedQuestionIds, debatesTabEnabled);
  const debateQuestionsByEntityId = React.useMemo(() => {
    const map = new Map<string, DebateQuestion>();
    for (const question of debateQuestionsQuery.data?.questions ?? []) {
      map.set(question.question_entity_id, question);
    }
    return map;
  }, [debateQuestionsQuery.data?.questions]);

  return (
    <div className="py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="smallTitle" color="text">
          Questions
        </Text>
        {!formOpen && (
          <Button type="button" variant="secondary" icon={<Plus />} onClick={() => setFormOpen(true)}>
            Add question
          </Button>
        )}
      </div>

      {formOpen && <AddQuestionForm spaceId={spaceId} onCancel={() => setFormOpen(false)} />}

      <div className={cx(formOpen && 'mt-6')}>
        <QuestionsList
          questions={questions}
          isLoading={isLoading}
          spaceId={spaceId}
          debatesEnabled={debatesTabEnabled}
          debateQuestionsByEntityId={debateQuestionsByEntityId}
          debateStatus={debateQuestionsQuery.error instanceof Error ? debateQuestionsQuery.error.message : null}
        />
      </div>
    </div>
  );
}

function AddQuestionForm({ spaceId, onCancel }: { spaceId: string; onCancel: () => void }) {
  const { storage } = useMutate();
  const { setActiveSpace, bumpReviewVersion, setIsReviewOpen } = useDiff();
  const [questionText, setQuestionText] = React.useState('');
  const [answerA, setAnswerA] = React.useState('Yes');
  const [answerB, setAnswerB] = React.useState('No');
  const [topics, setTopics] = React.useState<SelectEntityCompactResult[]>([]);
  const [relatedPeople, setRelatedPeople] = React.useState<SelectEntityCompactResult[]>([]);
  const [relatedProjects, setRelatedProjects] = React.useState<SelectEntityCompactResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const selectionsByKey = {
    topics,
    relatedPeople,
    relatedProjects,
  };

  const setSelectionsByKey = {
    topics: setTopics,
    relatedPeople: setRelatedPeople,
    relatedProjects: setRelatedProjects,
  };

  const addSelection = (key: RelatedSelectionKey, selection: SelectEntityCompactResult) => {
    setSelectionsByKey[key](current => {
      if (current.some(item => item.id === selection.id)) return current;
      return [...current, selection];
    });
  };

  const removeSelection = (key: RelatedSelectionKey, id: string) => {
    setSelectionsByKey[key](current => current.filter(item => item.id !== id));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const draft = buildQuestionDraft({
        spaceId,
        questionText,
        answerLabels: [answerA, answerB],
        topics,
        relatedPeople,
        relatedProjects,
      });

      for (const name of draft.names) {
        storage.entities.name.set(name.entityId, name.spaceId, name.value);
      }

      for (const relation of draft.relations) {
        storage.relations.set(relation);
      }

      setActiveSpace(spaceId);
      bumpReviewVersion();
      setIsReviewOpen(true);
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stage the question.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-grey-02 bg-white p-5 shadow-light">
      <div className="space-y-4">
        <label className="block">
          <Text as="span" variant="metadataMedium" color="text">
            Question
          </Text>
          <textarea
            value={questionText}
            onChange={event => setQuestionText(event.target.value)}
            rows={3}
            className="mt-2 block w-full resize-y rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            placeholder="What should this space decide?"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Text as="span" variant="metadataMedium" color="text">
              Answer 1
            </Text>
            <input
              type="text"
              value={answerA}
              onChange={event => setAnswerA(event.target.value)}
              className="mt-2 block w-full rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            />
          </label>
          <label className="block">
            <Text as="span" variant="metadataMedium" color="text">
              Answer 2
            </Text>
            <input
              type="text"
              value={answerB}
              onChange={event => setAnswerB(event.target.value)}
              className="mt-2 block w-full rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {relatedFields.map(field => (
            <div key={field.key} className="min-w-0">
              <Text as="div" variant="metadataMedium" color="text" className="mb-2">
                {field.label}
              </Text>
              <SelectEntityCompact
                spaceId={spaceId}
                placeholder={field.placeholder}
                relationValueTypes={[{ id: field.typeId }]}
                selected={selectionsByKey[field.key]}
                onDone={selection => addSelection(field.key, selection)}
                onRemoveSelected={id => removeSelection(field.key, id)}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Text as="p" variant="body" color="red-01" className="mt-4">
          {error}
        </Text>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Open proposal</Button>
      </div>
    </form>
  );
}

function QuestionsList({
  questions,
  isLoading,
  spaceId,
  debatesEnabled,
  debateQuestionsByEntityId,
  debateStatus,
}: {
  questions: Entity[];
  isLoading: boolean;
  spaceId: string;
  debatesEnabled: boolean;
  debateQuestionsByEntityId: Map<string, DebateQuestion>;
  debateStatus: string | null;
}) {
  if (isLoading && questions.length === 0) {
    return (
      <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
        <Text color="grey-04">Loading questions...</Text>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
        <Text as="h3" variant="bodySemibold" color="text">
          No questions yet
        </Text>
        <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[560px]">
          Add a question to stage it as an edit, then publish it through Review edits.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {debateStatus && debatesEnabled && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-3">
          <Text color="red-01">{debateStatus}</Text>
        </div>
      )}
      {questions.map(question => (
        <QuestionListItem
          key={question.id}
          question={question}
          spaceId={spaceId}
          debatesEnabled={debatesEnabled}
          debateQuestion={debateQuestionsByEntityId.get(question.id) ?? null}
        />
      ))}
    </div>
  );
}

function QuestionListItem({
  question,
  spaceId,
  debatesEnabled,
  debateQuestion,
}: {
  question: Entity;
  spaceId: string;
  debatesEnabled: boolean;
  debateQuestion: DebateQuestion | null;
}) {
  const router = useRouter();
  const answers = relationsForProperty(question.relations, ANSWERS_PROPERTY_ID);
  const topics = relationsForProperty(question.relations, TOPICS_PROPERTY_ID);
  const relatedPeople = relationsForProperty(question.relations, RELATED_PEOPLE_PROPERTY_ID);
  const relatedProjects = relationsForProperty(question.relations, RELATED_PROJECTS_PROPERTY_ID);
  const published = isQuestionPublished(question);
  const answerLabels = answerLabelsForQuestion(answers);
  const joinQueue = useJoinDebateQueue(spaceId);
  const acceptMatch = useAcceptDebateMatch(spaceId);
  const declineMatch = useDeclineDebateMatch(spaceId);
  const activeMatch = debateQuestion?.active_match ?? null;
  const activeDebate = debateQuestion?.active_debate ?? null;
  const mutationError =
    joinQueue.error instanceof Error
      ? joinQueue.error.message
      : acceptMatch.error instanceof Error
        ? acceptMatch.error.message
        : declineMatch.error instanceof Error
          ? declineMatch.error.message
          : null;

  const joinSide = (side: DebateSide) => {
    joinQueue.mutate({
      questionId: question.id,
      request: {
        side,
        question: question.name ?? question.id,
        description: question.description,
        for_label: answerLabels.for,
        against_label: answerLabels.against,
      },
    });
  };

  const handleAcceptMatch = () => {
    if (!activeMatch) return;
    acceptMatch.mutate(
      { matchId: activeMatch.id },
      {
        onSuccess: result => {
          if (result.debate) {
            router.push(`/space/${spaceId}/debates/${result.debate.id}`);
          }
        },
      }
    );
  };

  return (
    <article className="rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Text as="h3" variant="bodySemibold" color="text" className="block">
            {question.name ?? question.id}
          </Text>

          {!published && debatesEnabled && (
            <Text as="p" variant="body" color="grey-04" className="mt-2">
              Publish this question before starting a debate.
            </Text>
          )}
        </div>

        {debatesEnabled && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {activeDebate ? (
              <Button
                type="button"
                variant="secondary"
                small
                onClick={() => router.push(`/space/${spaceId}/debates/${activeDebate.id}`)}
              >
                Enter debate
              </Button>
            ) : activeMatch ? (
              <>
                <Button type="button" small onClick={handleAcceptMatch} disabled={acceptMatch.isPending}>
                  Accept match
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  small
                  onClick={() => declineMatch.mutate(activeMatch.id)}
                  disabled={declineMatch.isPending}
                >
                  Decline
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  small
                  onClick={() => joinSide('for')}
                  disabled={!published || joinQueue.isPending || debateQuestion?.viewer_waiting_side === 'for'}
                >
                  {answerLabels.for}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  small
                  onClick={() => joinSide('against')}
                  disabled={!published || joinQueue.isPending || debateQuestion?.viewer_waiting_side === 'against'}
                >
                  {answerLabels.against}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {debatesEnabled && (
        <QuestionDebateStatus
          debateQuestion={debateQuestion}
          answerLabels={answerLabels}
          mutationError={mutationError}
          published={published}
        />
      )}

      <RelationChipGroup label="Answers" relations={answers} className="mt-3" />

      {(topics.length > 0 || relatedPeople.length > 0 || relatedProjects.length > 0) && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <RelationChipGroup label="Topics" relations={topics} />
          <RelationChipGroup label="People" relations={relatedPeople} />
          <RelationChipGroup label="Projects" relations={relatedProjects} />
        </div>
      )}
    </article>
  );
}

function QuestionDebateStatus({
  debateQuestion,
  answerLabels,
  mutationError,
  published,
}: {
  debateQuestion: DebateQuestion | null;
  answerLabels: DebateSideLabels;
  mutationError: string | null;
  published: boolean;
}) {
  if (mutationError) {
    return (
      <Text as="p" variant="body" color="red-01" className="mt-3">
        {mutationError}
      </Text>
    );
  }

  if (!published) return null;

  if (debateQuestion?.active_debate) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Debate {debateQuestion.active_debate.status.replace('_', ' ')}
      </Text>
    );
  }

  if (debateQuestion?.active_match) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Match found. Both speakers need to accept.
      </Text>
    );
  }

  if (debateQuestion?.viewer_waiting_side) {
    const waitingFor = labelForSide(oppositeSide(debateQuestion.viewer_waiting_side), answerLabels);
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Waiting for someone to take {waitingFor}.
      </Text>
    );
  }

  return null;
}

function RelationChipGroup({
  label,
  relations,
  className,
}: {
  label: string;
  relations: Relation[];
  className?: string;
}) {
  if (relations.length === 0) return null;

  return (
    <div className={className}>
      <Text as="div" variant="metadataMedium" color="grey-04" className="mb-1">
        {label}
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {relations.map(relation => (
          <span
            key={relation.id}
            className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
          >
            <span className="truncate">{relation.toEntity.name ?? relation.toEntity.id}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function relationsForProperty(relations: Relation[], propertyId: string): Relation[] {
  return relations.filter(relation => relation.type.id === propertyId && relation.isDeleted !== true);
}

type DebateSideLabels = {
  for: string;
  against: string;
};

function answerLabelsForQuestion(answers: Relation[]): DebateSideLabels {
  return {
    for: answers[0]?.toEntity.name ?? 'For',
    against: answers[1]?.toEntity.name ?? 'Against',
  };
}

function labelForSide(side: DebateSide, labels: DebateSideLabels) {
  return side === 'for' ? labels.for : labels.against;
}

function isQuestionPublished(question: Entity): boolean {
  return !question.relations.some(relation => relation.isLocal && relation.hasBeenPublished !== true);
}
