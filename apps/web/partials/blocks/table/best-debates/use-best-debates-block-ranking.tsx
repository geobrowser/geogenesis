'use client';

import * as React from 'react';

import {
  type BallotGrades,
  type Grade,
  type GradedBallot,
  gradeInto,
  gradeOf,
  hasAnyGrade,
  removeEntry,
  stepEntry,
} from '~/core/blocks/ranking/ranking-grades';
import type { RankingSubmissionSlot } from '~/core/blocks/ranking/ranking-submission-types';
import {
  useBestDebatesBallotPublisher,
  useMyPushedDownDebates,
} from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { normId } from '~/core/utils/norm-id';

import { rankingComposeSeed, useRankingComposeDraft } from '../use-ranking-compose-draft';
import { type BestDebatesGrading, type GradeMethod, gradeChanges, useRecordGrade } from './best-debate-grading';
import { type PublishedBase, useBestDebatesCompose } from './use-best-debates-compose';
import { useBestDebatesPushDownSlot } from './use-best-debates-push-down-slot';

const NO_IDS: readonly string[] = [];

/**
 * Ranking from the space page's Best debates block (Preston, 12 Nov): Rank on a row opens the
 * compare flow over the page, and Done publishes the ranker's ballot with that one placement
 * (`publishOnDone`, through the same queue and merge as the ranking screen). Down rank is the
 * ranking screen's: the downvote at once, and a toast with Undo.
 *
 * Off (every read idle, nothing drawn) unless the viewer may rank: the flag and Debates membership.
 */
export function useBestDebatesBlockRanking({
  enabled,
  blockId,
  spaceId,
  isMobile,
}: {
  enabled: boolean;
  blockId: string;
  spaceId: string;
  isMobile: boolean;
}) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { myLastSubmission, myGrades, saveMySubmission, isSaving, isLoading, ballotReadError, unsavedDraft } =
    useRankingSubmissions(blockId, spaceId, 'Best debates');
  const { orderedIds, grades, setOrderedIds, setDraft, getBasedOnOrderedIds, getBasedOnGrades, markPublished } =
    useRankingComposeDraft(rankingComposeSeed(unsavedDraft, myLastSubmission?.orderedEntityIds, myGrades));

  const { debates: pushedDown } = useMyPushedDownDebates({ blockId: enabled ? blockId : null });
  const pushedDownEntityIds = React.useMemo(() => pushedDown.map(debate => debate.entityId), [pushedDown]);
  const pushDown = useBestDebatesPushDownSlot({ blockId: enabled ? blockId : null, pushedDownEntityIds });
  const { publish: publishClearingDownvotes, isPublishing } = useBestDebatesBallotPublisher();

  const getPublishedBase = () => ({ ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() });
  const save = async (slots: RankingSubmissionSlot[], basedOn?: PublishedBase) => {
    const base = basedOn ?? getPublishedBase();
    const result = await publishClearingDownvotes(
      slots.map(slot => slot.id),
      () => saveMySubmission(slots, undefined, { basedOnOrderedIds: base.ids, basedOnGrades: base.grades })
    );
    return result?.published ?? null;
  };

  // The compare view names the debate it shows from your ranking; the block's rows don't hold them.
  const { entries } = useRankingEntryEntities(spaceId, enabled ? orderedIds : []);
  const nameById = React.useMemo(() => new Map(entries.map(entry => [normId(entry.entityId), entry.name])), [entries]);

  const compose = useBestDebatesCompose({
    enabled,
    blockId,
    blockSpaceId: spaceId,
    isMobile,
    orderedIds,
    grades,
    setOrderedIds,
    hasUnpublishedChanges: false,
    nameOf: entityId => nameById.get(normId(entityId)) ?? null,
    personalSpaceId,
    saveMySubmission: save,
    isSaving: isSaving || isPublishing,
    pushDown: pushDown.slot,
    onPublished: (published, sentIds, sentGrades) =>
      markPublished(published.orderedEntityIds, sentIds, published.grades, sentGrades),
    // Nothing else on this page can save the placement, so Done publishes it.
    publishOnDone: true,
    // Done and the popup's grades both publish from here, one at a time (GEO-3729).
    serialPublishes: true,
    getPublishedBase,
  });

  const myRankById = React.useMemo(() => new Map(orderedIds.map((id, i) => [normId(id), i + 1])), [orderedIds]);
  // Until the ranker's own ballot is read whole, a placement would compare against the wrong list.
  const ready = enabled && !isLoading && !ballotReadError;

  const grading = useBlockGrading({
    blockId,
    ready,
    orderedIds,
    grades,
    setDraft,
    getBasedOnOrderedIds,
    getBasedOnGrades,
    publish: compose.publish,
    whenPublishesSettle: compose.whenPublishesSettle,
    downRank: compose.requestPushDown,
  });

  return {
    enabled,
    ready,
    myRankOf: (entityId: string) => myRankById.get(normId(entityId)) ?? null,
    rank: (entityId: string) => compose.placeFromTeam(entityId),
    downRank: (entityId: string) => compose.requestPushDown(entityId),
    /** The watch popup's grade row (GEO-3729): each grade publishes at once. */
    grading: enabled ? grading : null,
    pushedDownEntityIds: enabled ? pushedDownEntityIds : NO_IDS,
    /** "You've ranked N of M debates from the last 7 days", in To rank's terms. */
    coverage: enabled && compose.toRankCoverage ? compose.toRankCoverage : null,
    dialogs: enabled ? (
      <>
        {compose.dialogs}
        {pushDown.binding(compose.activeEntityId)}
      </>
    ) : null,
  };
}

/**
 * Grading from the block's watch popup (GEO-3729). A grade shows at once and publishes straight
 * away. Grades given while a publish is out are sent together in the next one, so a quick run of
 * grades never loses a tap and never sends one publish per tap. A failed publish puts the ranking
 * back as published (its toast says what happened).
 */
export function useBlockGrading({
  blockId,
  ready,
  orderedIds,
  grades,
  setDraft,
  getBasedOnOrderedIds,
  getBasedOnGrades,
  publish,
  whenPublishesSettle = () => Promise.resolve(),
  downRank,
}: {
  blockId: string;
  ready: boolean;
  orderedIds: string[];
  grades: BallotGrades;
  setDraft: (ids: string[], grades: BallotGrades) => void;
  getBasedOnOrderedIds: () => string[];
  getBasedOnGrades: () => BallotGrades;
  publish: (ids: string[], grades?: BallotGrades) => Promise<boolean>;
  /**
   * Resolves once the block's other publishes (a placement's Done) have finished. Grades wait for
   * it, then build on what it published, so they never meet the ballot publisher busy.
   */
  whenPublishesSettle?: () => Promise<void>;
  downRank: (entityId: string) => void;
}): BestDebatesGrading {
  const recordGrade = useRecordGrade(blockId);
  // The draft as of the last grade, read by the publish loop (state lags a render behind).
  const latest = React.useRef({ ids: orderedIds, grades });
  // Grades not yet sent: each publish replays them onto what is published at that moment, never
  // sends them from a stale copy.
  const queued = React.useRef<Array<(draft: GradedBallot) => GradedBallot>>([]);
  const inFlight = React.useRef(false);
  /** How each debate's unsent grade was given, for its published event. */
  const methods = React.useRef(new Map<string, GradeMethod>());
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(new Set());
  if (!inFlight.current) latest.current = { ids: orderedIds, grades };

  const flush = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      let ok = true;
      while (ok && queued.current.length > 0) {
        await whenPublishesSettle();
        // Every grade not yet published, replayed onto what is published now (which a placement or
        // this loop's last publish may have just moved, merging in another device's changes).
        const before = { ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() };
        const sent = queued.current.reduce((draft, change) => change(draft), before);
        queued.current = [];
        // How each change in this publish was made; changes from now on go with the next one.
        const passMethods = methods.current;
        methods.current = new Map();
        latest.current = sent;
        setDraft(sent.ids, sent.grades);
        ok = await publish(sent.ids, sent.grades);
        if (ok) {
          for (const change of gradeChanges(before.ids, before.grades, sent.ids, sent.grades)) {
            recordGrade(change.entityId, {
              grade: change.grade,
              previousGrade: change.previousGrade,
              method: passMethods.get(normId(change.entityId)) ?? 'popup',
              mutationKind: 'published',
            });
          }
        }
      }
      if (!ok) {
        // A failed publish puts the ranking back as published, so the row never shows a grade
        // that didn't go out; grades tapped during it go with it (its toast says what happened).
        queued.current = [];
        methods.current.clear();
        latest.current = { ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() };
        setDraft(latest.current.ids, latest.current.grades);
      }
    } finally {
      inFlight.current = false;
      setSaving(new Set());
    }
  }, [getBasedOnGrades, getBasedOnOrderedIds, publish, recordGrade, setDraft, whenPublishesSettle]);

  const apply = React.useCallback(
    (entityId: string, change: (draft: GradedBallot) => GradedBallot, method: GradeMethod) => {
      // The latest way it was changed names the change it publishes.
      methods.current.set(normId(entityId), method);
      queued.current.push(change);
      latest.current = change(latest.current);
      setDraft(latest.current.ids, latest.current.grades);
      setSaving(current => new Set(current).add(normId(entityId)));
      void flush();
    },
    [flush, setDraft]
  );

  const placeById = React.useMemo(() => new Map(orderedIds.map((id, i) => [normId(id), i + 1])), [orderedIds]);

  return {
    ready,
    needsTierLines: orderedIds.length > 0 && !hasAnyGrade(orderedIds, grades),
    gradeOf: entityId => (placeById.has(normId(entityId)) ? gradeOf(grades, entityId) : null),
    placeOf: entityId => placeById.get(normId(entityId)) ?? null,
    isSaving: entityId => saving.has(normId(entityId)),
    count: orderedIds.length,
    grade: (entityId: string, grade: Grade, method: GradeMethod = 'popup') =>
      apply(entityId, draft => gradeInto(draft.ids, draft.grades, entityId, grade), method),
    // Presses publish like grades, so a run of them goes out as one publish.
    move: (entityId: string, direction: -1 | 1) =>
      apply(entityId, draft => stepEntry(draft.ids, draft.grades, entityId, direction), 'nudge'),
    remove: (entityId: string) => apply(entityId, draft => removeEntry(draft.ids, draft.grades, entityId), 'popup'),
    // Counted as Down rank's own `push_down` once its downvote lands.
    downRank,
  };
}
