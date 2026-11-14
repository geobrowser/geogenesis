'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';
import { type BallotGrades, type Grade, gradeOf } from '~/core/blocks/ranking/ranking-grades';
import { normId } from '~/core/utils/norm-id';

/**
 * What the watch popup's grade row needs from the surface it opens on (GEO-3729). The Best debates
 * block publishes each grade at once; the ranking screen puts it in its draft, which its Publish
 * sends. The row doesn't know which it is on.
 */
export type BestDebatesGrading = {
  /** The ranker's ballot has been read whole: grading waits for it. */
  ready: boolean;
  /**
   * The ranker has a ranking with no grades at all: A, B and C wait for "Grade your ranking"
   * (Preston, 13 Nov), so a first grade never jumps above every debate they placed by hand.
   */
  needsTierLines: boolean;
  /** Opens "Grade your ranking", where the surface has it. */
  onGradeYourRanking?: () => void;
  gradeOf: (entityId: string) => Grade | null;
  /** The debate's place in the ranker's ranking (1-based), or null when it isn't in it. */
  placeOf: (entityId: string) => number | null;
  /** A grade of this debate is being published (the block). */
  isSaving: (entityId: string) => boolean;
  /** A, B or C: the debate goes to the top of that tier. `method` is where it was given. */
  grade: (entityId: string, grade: Grade, method?: GradeMethod) => void;
  /**
   * Re-order: the Rank flow's Placed step for this debate at its place (its arrows cross a tier line
   * into that tier), over the popup. Done keeps the move in the draft, or publishes it on the block.
   */
  reorder: (entityId: string) => void;
  /** Takes the debate out of the ranking. */
  remove: (entityId: string) => void;
  /** D: the existing Down rank (downvote, then off the ranking; its toast offers Undo). Its
   *  analytics are Down rank's own (`push_down`). */
  downRank: (entityId: string) => void;
  /**
   * After the row's Undo has cleared the downvote: puts the debate back where it was, with its
   * grade, where the surface can (the ranking screen's draft). Without it, Undo ends with the
   * debate out of the ranking, as the block's Down rank always has.
   */
  undoDownRank?: (entityId: string) => void;
};

/**
 * Where a grade was given: the popup, a list row's Grade menu, a drag, the tier lines, or a move
 * across a tier line in the popup's Re-order.
 */
export type GradeMethod = 'popup' | 'list' | 'drag' | 'tier_lines' | 'reorder' | 'ranking_screen';

/** D is Down rank: it is counted by Down rank's own `push_down` action, not here. */
export type GradeChange = {
  grade: Grade | 'none';
  previousGrade: Grade | 'none';
  method: GradeMethod;
  mutationKind: 'published' | 'draft';
};

/**
 * Records a grade as a canonical `action_completed` (`grade_debate`). Grades per ranker per day
 * count `mutation_kind = 'published'` (the ranking screen's draft grades are recorded again, as
 * published, when its Publish lands).
 */
export function useRecordGrade(blockId: string) {
  const getContext = useActionContext('ranking_composer', 'debate', '');
  return React.useCallback(
    (entityId: string, change: GradeChange) => {
      try {
        recordAction('grade_debate', getContext({ target_type: 'debate', target_id: entityId }), {
          ranking_id: blockId,
          entity_id: entityId,
          grade: change.grade,
          previous_grade: change.previousGrade,
          method: change.method,
          mutation_kind: change.mutationKind,
        });
      } catch {
        /* Never fail a grade over analytics. */
      }
    },
    [blockId, getContext]
  );
}

/** Every entry whose grade differs between two ballots, with both grades. */
export function gradeChanges(
  beforeIds: readonly string[],
  before: BallotGrades,
  afterIds: readonly string[],
  after: BallotGrades
): Array<{ entityId: string; previousGrade: Grade | 'none'; grade: Grade | 'none' }> {
  const ids = [...new Map([...beforeIds, ...afterIds].map(id => [normId(id), id])).values()];
  const inAfter = new Set(afterIds.map(normId));
  const inBefore = new Set(beforeIds.map(normId));
  return ids.flatMap(entityId => {
    const was = inBefore.has(normId(entityId)) ? (gradeOf(before, entityId) ?? 'none') : 'none';
    const now = inAfter.has(normId(entityId)) ? (gradeOf(after, entityId) ?? 'none') : 'none';
    return was === now ? [] : [{ entityId, previousGrade: was, grade: now }];
  });
}

/** The grading of the surface rows sit on (the block or the ranking screen), for their Grade menu. */
export const BestDebatesGradingContext = React.createContext<BestDebatesGrading | null>(null);

export function useBestDebatesGrading(): BestDebatesGrading | null {
  return React.useContext(BestDebatesGradingContext);
}
