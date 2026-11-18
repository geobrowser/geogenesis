'use client';

import * as React from 'react';

import type { BallotGrades } from './ranking-grades';

/**
 * The ballot the ranking screen is editing (GEO-3679): its current draft, and a way to publish a
 * new order of it. When push-down runs on the ranking screen it has to edit this draft, not
 * re-publish the last published ballot: the draft can hold unpublished changes, and publishing
 * the stale ballot would wipe them, then the next Publish would put the pushed-down debate back.
 */
export type ComposeBallot = {
  /** The draft, in order. */
  orderedIds: readonly string[];
  /** Its grades (Best debates, GEO-3729). */
  grades?: BallotGrades;
  /**
   * Makes `orderedIds` the draft and publishes it as the member's ballot. Resolves true once
   * published, false when it didn't (the screen reports why). With `grades`, those become the
   * draft's grades; without, entries keep theirs.
   */
  publish: (orderedIds: string[], grades?: BallotGrades) => Promise<boolean>;
};

export const RankingComposeBallotContext = React.createContext<ComposeBallot | null>(null);

export function useRankingComposeBallot(): ComposeBallot | null {
  return React.useContext(RankingComposeBallotContext);
}

/**
 * The ranking screen's `ComposeBallot`. Its `publish` always runs the screen's newest publish
 * function, read through a ref: a memoised closure would keep the `saveMySubmission` (and rows)
 * from the render where the draft last changed, so after a first publish it could mint a second
 * rank entity instead of revising the one just created, or fall back to the wrong space for a
 * row that loaded later. The object itself only changes with the draft.
 */
export function useComposeBallot(
  source: {
    orderedIds: readonly string[];
    grades?: BallotGrades;
    setOrderedIds: (ids: string[]) => void;
    /** Sets the draft with its grades (Best debates). */
    setDraft?: (ids: string[], grades: BallotGrades) => void;
    publish: (ids: string[]) => Promise<boolean>;
    /**
     * Edits stay in the draft until the screen's Publish (the Best debates screen, Preston 12 Nov):
     * `publish` then only sets the draft, so a push-down's ballot edit waits with everything else.
     */
    deferPublish?: boolean;
  } | null
): ComposeBallot | null {
  const latest = React.useRef(source);
  latest.current = source;
  const isOn = source !== null;
  const orderedIds = source?.orderedIds;
  const grades = source?.grades;

  return React.useMemo(() => {
    if (!isOn || !orderedIds) return null;
    return {
      orderedIds,
      grades,
      publish: async (ids: string[], nextGrades?: BallotGrades) => {
        const current = latest.current;
        if (!current) return false;
        if (nextGrades && current.setDraft) current.setDraft(ids, nextGrades);
        else current.setOrderedIds(ids);
        if (current.deferPublish) return true;
        return current.publish(ids);
      },
    };
  }, [isOn, orderedIds, grades]);
}
