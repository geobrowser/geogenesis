'use client';

import * as React from 'react';

import { movedEntries } from '~/core/blocks/ranking/ranking-draft-changes';
import {
  type BallotGrades,
  NO_GRADES,
  type Tier,
  gradeAtPlace,
  pruneGrades,
  tierOf,
} from '~/core/blocks/ranking/ranking-grades';
import { mergeBallots, sameBallot } from '~/core/blocks/ranking/ranking-publish-queue';
import type { UnsavedRankingDraft } from '~/core/blocks/ranking/ranking-publish-queue';
import { normId } from '~/core/utils/norm-id';

/** What the compose screen's list starts from, and the published ballot that
 *  list is based on (what publishing it passes as `basedOnOrderedIds`). Best
 *  debates adds the grades of each (GEO-3729). */
export type RankingComposeSeed = { ids: string[]; base: string[]; grades?: BallotGrades; baseGrades?: BallotGrades };

/**
 * The seed, in order of precedence (GEO-3680):
 * 1. a draft handed back after another device's edit overtook ours, based on
 *    the draft itself: the publish path folds the overtaken edit and the other
 *    device's ballot into the published side, so basing on anything earlier
 *    would read the ranker removing an item of the draft as "unchanged" and
 *    bring it back;
 * 2. otherwise the published ballot, based on itself.
 * The ranker's own unpublished edits are then merged onto whichever it is (see
 * `useRankingComposeDraft`).
 */
export function rankingComposeSeed(
  unsavedDraft: UnsavedRankingDraft | null,
  publishedIds: string[] | undefined,
  publishedGrades: BallotGrades = NO_GRADES
): RankingComposeSeed {
  if (unsavedDraft) {
    const grades = unsavedDraft.grades ?? NO_GRADES;
    return { ids: unsavedDraft.orderedEntityIds, base: unsavedDraft.orderedEntityIds, grades, baseGrades: grades };
  }
  const ids = publishedIds ?? [];
  return { ids, base: ids, grades: publishedGrades, baseGrades: publishedGrades };
}

/**
 * The grades of a new order of the list (GEO-3729): an entry that stays keeps its grade, a removed
 * one loses it, and one that joins takes the tier it lands in (`gradeAtPlace`). A list with no
 * grades at all (every block but Best debates) stays without.
 */
export function gradesForOrder(
  previousIds: readonly string[],
  previousGrades: BallotGrades,
  nextIds: readonly string[],
  /** The debate the change moved, when the caller knows (a nudge swaps it with a neighbour). */
  movedId?: string
): BallotGrades {
  if (previousGrades.size === 0) return NO_GRADES;
  const before = new Set(previousIds.map(normId));
  let grades = pruneGrades(nextIds, previousGrades);
  for (const id of nextIds) if (!before.has(normId(id))) grades = gradeAtPlace(nextIds, grades, id);
  // A debate moved across a tier line (the placed dialog's nudge) takes the tier it now sits in,
  // so the publish never moves it back. One that still fits between its neighbours keeps its grade.
  const moved = movedEntries(previousIds, nextIds, movedId ? new Set([normId(movedId)]) : undefined);
  if (moved.size === 0) return grades;
  const next = new Map(grades);
  nextIds.forEach((id, index) => {
    if (!moved.has(normId(id))) return;
    const own = TIER_ORDER.indexOf(tierOf(next, id));
    const above = index > 0 ? TIER_ORDER.indexOf(tierOf(next, nextIds[index - 1])) : -1;
    const below = index < nextIds.length - 1 ? TIER_ORDER.indexOf(tierOf(next, nextIds[index + 1])) : TIER_ORDER.length;
    if (own >= above && own <= below) return;
    const tier = TIER_ORDER[above >= 0 ? above : below];
    if (tier === 'ungraded') next.delete(normId(id));
    else next.set(normId(id), tier);
  });
  return next;
}

const TIER_ORDER: readonly Tier[] = ['A', 'B', 'C', 'ungraded'];

type Draft = { ids: string[]; grades: BallotGrades };

/**
 * The compose screen's editable list. When the seed changes (the published
 * ballot moved, or a draft was handed back), an editor with no edits of its
 * own takes the new seed; an editor with edits keeps them, merged onto it
 * (three-way, against the previous seed), so a concurrent change never wipes
 * what the ranker is in the middle of. On Best debates the list carries a
 * grade per entry, merged the same way.
 */
export function useRankingComposeDraft(seed: RankingComposeSeed) {
  const seedGrades = seed.grades ?? NO_GRADES;
  const [draft, setDraftState] = React.useState<Draft>({ ids: seed.ids, grades: seedGrades });
  const seedRef = React.useRef(seed);
  const seedKey = `${seed.ids.join('|')}#${seed.base.join('|')}#${[...seedGrades].join('|')}#${[
    ...(seed.baseGrades ?? NO_GRADES),
  ].join('|')}`;

  React.useEffect(() => {
    const previous = seedRef.current;
    seedRef.current = seed;
    setDraftState(current => {
      const next = sameBallot(current.ids, current.grades, previous.ids, previous.grades)
        ? { ids: seed.ids, grades: seed.grades ?? NO_GRADES }
        : mergeBallots({
            base: { ids: previous.ids, grades: previous.grades },
            ours: { ids: current.ids, grades: current.grades },
            theirs: { ids: seed.ids, grades: seed.grades },
          });
      return sameBallot(next.ids, next.grades, current.ids, current.grades)
        ? current
        : { ids: next.ids, grades: pruneGrades(next.ids, next.grades) };
    });
    // `seedKey` is the joined signature of `seed`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  /**
   * A new order (or a function of the current one); grades follow it (`gradesForOrder`). `movedId`
   * names the debate the change moved, when known.
   */
  const setOrderedIds = React.useCallback((next: string[] | ((current: string[]) => string[]), movedId?: string) => {
    setDraftState(current => {
      const ids = typeof next === 'function' ? next(current.ids) : next;
      return { ids, grades: gradesForOrder(current.ids, current.grades, ids, movedId) };
    });
  }, []);

  /** A new order with its grades, as given (a grade, a drag across a tier line). */
  const setDraft = React.useCallback((ids: string[], grades: BallotGrades) => {
    setDraftState({ ids, grades: pruneGrades(ids, grades) });
  }, []);

  /** The published ballot the current list is based on, for `basedOnOrderedIds`. */
  const getBasedOnOrderedIds = React.useCallback(() => seedRef.current.base, []);
  /** Its grades, for `basedOnGrades`. */
  const getBasedOnGrades = React.useCallback(() => seedRef.current.baseGrades ?? NO_GRADES, []);

  /**
   * Moves the merge base to what this device just published (GEO-3678, Best debates' placements),
   * and folds that ballot into the list. Without the base move, the base stays on the older seed
   * until the index catches up, and a drag or removal of a just-published item made meanwhile
   * would be undone when the published order lands.
   *
   * `published` is the ballot that went out, which the publish path may have merged onto another
   * device's changes (GEO-3680), so it can hold items this list never had. They are folded in
   * (three-way against `sent`, the list this device published), so the list and the base agree:
   * otherwise the next publish would read another device's addition as removed here. Edits made
   * since `sent` (a drag while the publish ran) are kept. Without `sent`, the list as it stands
   * now is taken as what was sent. `publishedGrades` / `sentGrades` do the same for grades.
   */
  const markPublished = React.useCallback(
    (
      published: readonly string[],
      sent?: readonly string[],
      publishedGrades: BallotGrades = NO_GRADES,
      sentGrades?: BallotGrades
    ) => {
      const ids = [...published];
      seedRef.current = { ids, base: ids, grades: publishedGrades, baseGrades: publishedGrades };
      setDraftState(current => {
        const next = mergeBallots({
          base: { ids: sent ?? current.ids, grades: sentGrades ?? current.grades },
          ours: { ids: current.ids, grades: current.grades },
          theirs: { ids, grades: publishedGrades },
        });
        return sameBallot(next.ids, next.grades, current.ids, current.grades)
          ? current
          : { ids: next.ids, grades: pruneGrades(next.ids, next.grades) };
      });
    },
    []
  );

  return {
    orderedIds: draft.ids,
    grades: draft.grades,
    setOrderedIds,
    setDraft,
    getBasedOnOrderedIds,
    getBasedOnGrades,
    markPublished,
  };
}
