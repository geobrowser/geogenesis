import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANSWERS_PROPERTY_ID, QUESTION_TYPE_ID } from '~/core/questions/ontology';
import type { Entity, Relation } from '~/core/types';

import { QuestionsPageClient } from './questions-page-client';

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  const setActiveSpace = vi.fn();
  const bumpReviewVersion = vi.fn();
  const setIsReviewOpen = vi.fn();
  const nameSet = vi.fn();
  const relationSet = vi.fn();

  return {
    replace,
    push,
    setActiveSpace,
    bumpReviewVersion,
    setIsReviewOpen,
    nameSet,
    relationSet,
  };
});

let questions: Entity[] = [];
let namesByEntityId = new Map<string, string>();
let stagedRelations: Relation[] = [];
let questionsTabEnabled = true;
let lastQueryEntitiesOptions: unknown = null;
let debateQuestionsResponse: { questions: unknown[] } = { questions: [] };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => {
    if (id !== 'questionsTab') {
      throw new Error(`Unexpected feature flag: ${id}`);
    }
    return questionsTabEnabled;
  },
}));

vi.mock('~/core/debates/hooks', () => ({
  oppositeSide: (side: 'for' | 'against') => (side === 'for' ? 'against' : 'for'),
  useDebateQuestions: () => ({ data: debateQuestionsResponse, error: null }),
  useJoinDebateQueue: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useAcceptDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeclineDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/core/state/diff-store', () => ({
  useDiff: () => ({
    setActiveSpace: mocks.setActiveSpace,
    bumpReviewVersion: mocks.bumpReviewVersion,
    setIsReviewOpen: mocks.setIsReviewOpen,
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (options: unknown) => {
    lastQueryEntitiesOptions = options;
    return { entities: questions, isLoading: false };
  },
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: {
        name: {
          set: mocks.nameSet,
        },
      },
      relations: {
        set: mocks.relationSet,
      },
    },
  }),
}));

vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({ placeholder }: { placeholder: string }) => (
    <div data-testid={`selector-${placeholder}`}>{placeholder}</div>
  ),
}));

function rebuildQuestions() {
  const questionIds = stagedRelations
    .filter(relation => relation.toEntity.id === QUESTION_TYPE_ID)
    .map(relation => relation.fromEntity.id);

  questions = questionIds.map(questionId => ({
    id: questionId,
    name: namesByEntityId.get(questionId) ?? null,
    description: null,
    spaces: ['space-1'],
    types: [{ id: QUESTION_TYPE_ID, name: 'Question' }],
    values: [],
    relations: stagedRelations.filter(relation => relation.fromEntity.id === questionId),
  }));
}

beforeEach(() => {
  questions = [];
  namesByEntityId = new Map();
  stagedRelations = [];
  questionsTabEnabled = true;
  lastQueryEntitiesOptions = null;
  debateQuestionsResponse = { questions: [] };
  vi.clearAllMocks();

  mocks.nameSet.mockImplementation((entityId: string, _spaceId: string, value: string) => {
    namesByEntityId.set(entityId, value);
    rebuildQuestions();
  });

  mocks.relationSet.mockImplementation((relation: Relation) => {
    stagedRelations.push(relation);
    rebuildQuestions();
  });
});

afterEach(() => {
  cleanup();
});

describe('QuestionsPageClient', () => {
  it('renders the empty state with Add question', () => {
    render(<QuestionsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add question' })).toBeInTheDocument();
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
  });

  it('queries questions by current space and includes unpublished local edits', () => {
    render(<QuestionsPageClient spaceId="space-1" />);

    expect(lastQueryEntitiesOptions).toMatchObject({
      where: {
        spaces: [{ equals: 'space-1' }],
        types: [{ id: { equals: QUESTION_TYPE_ID } }],
      },
      includeUnpublishedLocal: true,
    });
  });

  it('expands and cancels the add question form', () => {
    render(<QuestionsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));

    expect(screen.getByLabelText('Question')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Yes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('No')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add question' })).toBeInTheDocument();
  });

  it('stages a valid question and opens Review edits for the current space', async () => {
    render(<QuestionsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'Should we launch the questions workflow?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open proposal' }));

    await waitFor(() => {
      expect(mocks.nameSet).toHaveBeenCalled();
      expect(mocks.relationSet).toHaveBeenCalled();
      expect(mocks.setActiveSpace).toHaveBeenCalledWith('space-1');
      expect(mocks.bumpReviewVersion).toHaveBeenCalled();
      expect(mocks.setIsReviewOpen).toHaveBeenCalledWith(true);
    });
  });

  it('shows the locally staged question in the list after submit', async () => {
    render(<QuestionsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'Should we add ranking signals?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open proposal' }));

    expect(await screen.findByText('Should we add ranking signals?')).toBeInTheDocument();
    expect(screen.getByText('Answers')).toBeInTheDocument();
    const answerRelations = stagedRelations.filter(relation => relation.type.id === ANSWERS_PROPERTY_ID);
    expect(answerRelations.map(relation => relation.toEntity.name)).toEqual(['Yes', 'No']);
  });

  it('shows debate side controls for published questions when the feature flag is enabled', () => {
    questions = [
      {
        id: 'question-1',
        name: 'Should we debate this?',
        description: null,
        spaces: ['space-1'],
        types: [{ id: QUESTION_TYPE_ID, name: 'Question' }],
        values: [],
        relations: [
          {
            id: 'answer-1',
            entityId: 'answer-1',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'yes', name: 'Yes', value: 'Yes' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
          {
            id: 'answer-2',
            entityId: 'answer-2',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'no', name: 'No', value: 'No' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
        ],
      },
    ];

    render(<QuestionsPageClient spaceId="space-1" />);

    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('renders answers once and only makes the first two debate choices clickable', () => {
    questions = [
      {
        id: 'question-1',
        name: 'Which answer should be debated?',
        description: null,
        spaces: ['space-1'],
        types: [{ id: QUESTION_TYPE_ID, name: 'Question' }],
        values: [],
        relations: [
          {
            id: 'answer-1',
            entityId: 'answer-1',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Which answer should be debated?' },
            toEntity: { id: 'yes', name: 'Yes', value: 'Yes' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
          {
            id: 'answer-2',
            entityId: 'answer-2',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Which answer should be debated?' },
            toEntity: { id: 'no', name: 'No', value: 'No' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
          {
            id: 'answer-3',
            entityId: 'answer-3',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Which answer should be debated?' },
            toEntity: { id: 'maybe', name: 'Maybe', value: 'Maybe' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
        ],
      },
    ];

    render(<QuestionsPageClient spaceId="space-1" />);

    expect(screen.getAllByText('Yes')).toHaveLength(1);
    expect(screen.getAllByText('No')).toHaveLength(1);
    expect(screen.getAllByText('Maybe')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maybe' })).not.toBeInTheDocument();
  });

  it('does not allow starting another queue while a match prompt is active', () => {
    questions = [
      {
        id: 'question-1',
        name: 'Should we debate this?',
        description: null,
        spaces: ['space-1'],
        types: [{ id: QUESTION_TYPE_ID, name: 'Question' }],
        values: [],
        relations: [
          {
            id: 'answer-1',
            entityId: 'answer-1',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'yes', name: 'Yes', value: 'Yes' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
          {
            id: 'answer-2',
            entityId: 'answer-2',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'no', name: 'No', value: 'No' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
        ],
      },
    ];
    debateQuestionsResponse = {
      questions: [
        {
          question_entity_id: 'question-1',
          active_match: {
            id: 'match-1',
            question: { id: 'debate-question-1' },
            for: { user_id: 'user-for' },
            against: { user_id: 'user-against' },
            for_accepted: false,
            against_accepted: false,
            debate_id: null,
          },
          active_debate: null,
        },
      ],
    };

    render(<QuestionsPageClient spaceId="space-1" />);

    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
  });

  it('does not redirect to a persisted active debate from the questions page', () => {
    questions = [
      {
        id: 'question-1',
        name: 'Should we debate this?',
        description: null,
        spaces: ['space-1'],
        types: [{ id: QUESTION_TYPE_ID, name: 'Question' }],
        values: [],
        relations: [
          {
            id: 'answer-1',
            entityId: 'answer-1',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'yes', name: 'Yes', value: 'Yes' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
          {
            id: 'answer-2',
            entityId: 'answer-2',
            type: { id: ANSWERS_PROPERTY_ID, name: 'Answers' },
            fromEntity: { id: 'question-1', name: 'Should we debate this?' },
            toEntity: { id: 'no', name: 'No', value: 'No' },
            renderableType: 'RELATION',
            spaceId: 'space-1',
          },
        ],
      },
    ];
    debateQuestionsResponse = {
      questions: [
        {
          question_entity_id: 'question-1',
          active_match: null,
          active_debate: {
            id: 'debate-1',
            status: 'in_progress',
          },
        },
      ],
    };

    render(<QuestionsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('redirects direct visits when the feature flag is disabled', async () => {
    questionsTabEnabled = false;

    render(<QuestionsPageClient spaceId="space-1" />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/space/space-1');
    });
  });
});
