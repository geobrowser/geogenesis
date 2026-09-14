'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
import { entityAvatarsQueryKey, fetchEntityAvatars } from '~/core/io/subgraph/fetch-entity-avatars';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import {
  DEGREE_PROPERTY,
  EDUCATION_PROPERTY,
  EMPLOYMENT_PROPERTY,
  ROLES_PROPERTY,
} from '~/core/profile/history-ontology';
import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';
import {
  NOTHING_PENDING,
  type PendingAddition,
  type PendingHistory,
  type PendingRemoval,
  dropPendingAddition,
  hasPendingChanges,
  isPending,
  mergePendingEducation,
  mergePendingEmployment,
  organizationOf,
  pendingDraftFor,
  pendingOrganizationIds,
  replacePendingAddition,
  shareStintsByOrganization,
} from '~/core/profile/pending-history';
import {
  type EducationDraft,
  type PositionDraft,
  type StagedRows,
  stageEducation,
  stagePosition,
} from '~/core/profile/stage-history';
import type { Relation, Value } from '~/core/types';

type Params = { entityId: string; spaceId: string; enabled?: boolean };

type Kind = 'employment' | 'education';

const PROPERTIES: Record<Kind, { entry: string; card: string }> = {
  employment: { entry: ROLES_PROPERTY, card: EMPLOYMENT_PROPERTY },
  education: { entry: DEGREE_PROPERTY, card: EDUCATION_PROPERTY },
};

/**
 * The relation types the normalized cards actually surface.
 *
 * What "the indexer has caught up" is judged on. The rows and edges are the two
 * levels a card shows an id for; everything below them — dates, status, skills —
 * rides along in the same edit and is not separately observable here.
 */
const VISIBLE_RELATION_TYPES = new Set([EMPLOYMENT_PROPERTY, ROLES_PROPERTY, EDUCATION_PROPERTY, DEGREE_PROPERTY]);

/** What a published edit expects the next read to show, once it lands. */
type Expectation = { added: string[]; removed: string[]; since: number };

/**
 * An edit that has been published but is not readable yet.
 *
 * Held apart from the queue rather than left in it. The rows are kept only so
 * the modal can go on showing them; they are no longer the user's to change,
 * and leaving them queued meant Save stayed lit and `stagePending()` handed the
 * already-published relations back for a second proposal.
 *
 * Kept as a list. Nothing stops a second save inside the first one's window, and
 * replacing the record dropped the first edit from the screen, stopped anyone
 * waiting for it, and lost the stints it had minted — so a row added at that
 * employer afterwards opened a duplicate edge. Each waits for its own read.
 */
type Published = {
  /** The queue as it was, for display only. */
  rows: PendingHistory;
  /**
   * Stints minted for organisations that were new to the profile, per kind.
   *
   * So a further row at one of them joins the edge just published rather than
   * opening a second — the read cannot say yet that the first one exists.
   *
   * Kept apart by kind because an organisation can be both: a university that
   * employs people has an Education record and an Employment record, and one map
   * keyed on the organisation alone handed a job the degree's stint. Staging then
   * wrote no Employment relation at all, because it had been told the edge
   * existed — so the job hung off the education record and never appeared under
   * Experience.
   */
  stints: Record<Kind, Record<string, string>>;
  expectation: Expectation;
};

/**
 * How long to keep showing a published edit the read has not caught up with.
 *
 * Past this the graph's answer wins, even though it disagrees — an edit that
 * never lands must not leave the modal insisting forever on something that is
 * not there. Generous, because the wait is normally seconds and being wrong in
 * this direction only costs a stale-looking row.
 */
const INDEXING_DEADLINE_MS = 120_000;

/** Whether a read reflects everything a published edit said it would do. */
function reflects(
  cards: { employment: HistoryCard<HistoryEntry>[]; education: HistoryCard<HistoryEntry>[] },
  expectation: Expectation
) {
  const present = new Set<string>();

  for (const card of [...cards.employment, ...cards.education]) {
    for (const edge of card.edges) present.add(edge.relationId);
    for (const entry of card.entries) present.add(entry.relationId);
  }

  return expectation.added.every(id => present.has(id)) && expectation.removed.every(id => !present.has(id));
}

/**
 * Organisation edges left with nothing under them once everything queued lands.
 *
 * Worked out from the state as it finally stands, rather than when a row is
 * removed, because what hangs off an edge keeps changing after that: an unsaved
 * sibling that was keeping it alive can itself be dropped or moved to another
 * employer, and a row can be added at an employer whose last saved row is
 * already queued to go. Deciding on the way past left an empty Employment edge
 * behind in the first case, and published the new row under a deleted edge in the
 * second.
 *
 * "As it stands" includes an edit already published, because `data` here does
 * not: it lags a publish by a minute or two. Removing one of two roles, saving,
 * then removing the other inside that window read the first as still present —
 * so the edge survived with nothing under it, and once the read caught up the
 * card had no rows left to render and no way to reach the employer again.
 *
 * Counted per edge rather than per card: a card can group several edges to one
 * employer, and a row under a different edge cannot keep this one alive.
 */
function orphanedEdges(saved: HistoryCard<HistoryEntry>[], kind: Kind, outstanding: PendingHistory): PendingRemoval[] {
  const removed = new Set(outstanding.removals.map(removal => removal.relationId));
  const additions = kind === 'employment' ? outstanding.positions : outstanding.education;

  // Every stint something will still hang off afterwards — saved rows that are
  // staying, and unsaved rows that attached themselves to a saved edge.
  const kept = new Set<string>();
  for (const card of saved) {
    for (const entry of card.entries) {
      if (!removed.has(entry.relationId)) kept.add(entry.edge.stintId);
    }
  }
  for (const addition of additions) {
    if (addition.draft.existingStintId) kept.add(addition.draft.existingStintId);
  }

  const orphans: PendingRemoval[] = [];

  for (const card of saved) {
    for (const edge of card.edges) {
      // Already on its way out, from this edit or the one before it. Tombstoning
      // it again would put a second delete in the next proposal for a relation
      // that is gone.
      if (kept.has(edge.stintId) || isPending(edge.relationId) || removed.has(edge.relationId)) continue;

      // Only an edge this edit emptied. One that arrived already carrying nothing
      // is not ours to tidy up, and deleting it would be a change nobody asked for.
      if (!card.entries.some(entry => entry.edge.stintId === edge.stintId)) continue;

      orphans.push({
        relationId: edge.relationId,
        entityId: edge.stintId,
        typeId: PROPERTIES[kind].card,
        spaceId: edge.spaceId,
        subtree: edge.subtree,
      });
    }
  }

  return orphans;
}

/**
 * Work and education on the viewer's own profile (GEO-2858).
 *
 * Nothing here writes on its own. Adding a position, editing one, adding a degree
 * and removing either are collected, and the modal's Save publishes them
 * alongside the four header fields as a single edit — so correcting four things
 * costs one ~10s wait rather than four, and nothing lands until the user says so.
 *
 * The resting state shows saved records merged with whatever is still pending, so
 * the list reads as the profile they are about to have.
 */
export function useProfileHistory({ entityId, spaceId, enabled = true }: Params) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<PendingHistory>(NOTHING_PENDING);

  /**
   * A published edit the read has not caught up with yet.
   *
   * Publishing is not the same as being readable: the write lands on chain in
   * seconds and turns up in this query a minute or two later. Clearing the
   * pending rows on success and refetching therefore put the old answer straight
   * back, and the edit looked like it had been lost — `settleSuccess` in
   * `use-edit-profile` avoids exactly this for the name and photo, and says so.
   *
   * So the rows stay until a read agrees with them — here rather than in
   * `pending`, which is what can still be edited and published.
   */
  const [published, setPublished] = React.useState<Published[]>([]);

  const queryKey = profileHistoryQueryKey(entityId);

  const { data, dataUpdatedAt, isLoading, isError } = useQuery({
    queryKey,
    enabled: enabled && entityId !== '',
    queryFn: () => fetchProfileHistory(entityId),
    staleTime: 60_000,
    // Only while something is outstanding. Asking again on a timer is the only
    // way to learn the indexer has caught up; there is nothing to subscribe to.
    refetchInterval: published.length > 0 ? 5_000 : false,
  });

  /**
   * Logos for employers and schools a pending row names.
   *
   * The profile read collects these on its way past an edge; a row being added
   * has no edge yet. Without this a card showed an initial before saving and a
   * logo afterwards, which made the merged view look like it was guessing.
   */
  /**
   * Everything the modal should show over the graph's answer: the queue, and an
   * edit already published that the read has not caught up with.
   */
  const shown = React.useMemo((): PendingHistory => {
    if (published.length === 0) return pending;

    /**
     * A published row, brought up to date with what publishing it did.
     *
     * Marked `isSettling`, so the section shows it without offering to change
     * it: the row's real relation id is not on screen, and both handlers would
     * act on a queue it has already left.
     *
     * And rewritten against what went out, because the draft still describes the
     * profile as it was *before* the save. Left as it was, the card it builds
     * carries the placeholder stint `merge` invents for an organisation with no
     * saved edge — so "Add another role here" handed that placeholder back as
     * `existingStintId`, `shareStintsByOrganization` could not resolve it, and
     * staging opened a second Employment edge to the same company. The
     * organisation is no longer new either, and saying otherwise wrote its name
     * and a second Types relation all over again.
     */
    const settled = <TDraft extends PositionDraft | EducationDraft>(
      additions: PendingAddition<TDraft>[],
      stints: Record<string, string>
    ): PendingAddition<TDraft>[] =>
      additions.map(addition => {
        const organization = organizationOf(addition.draft);
        const published = { isNew: false, id: organization.id, name: organization.name };

        return {
          ...addition,
          isSettling: true,
          draft: {
            ...addition.draft,
            existingStintId: stints[organization.id] ?? addition.draft.existingStintId,
            ...('company' in addition.draft ? { company: published } : { school: published }),
          },
        };
      });

    return {
      positions: [
        ...published.flatMap(record => settled(record.rows.positions, record.stints.employment)),
        ...pending.positions,
      ],
      education: [
        ...published.flatMap(record => settled(record.rows.education, record.stints.education)),
        ...pending.education,
      ],
      removals: [...published.flatMap(record => record.rows.removals), ...pending.removals],
    };
  }, [pending, published]);

  /**
   * Relations on their way out, queued or already published.
   *
   * The read still returns the published ones for a minute or two, so anything
   * reasoning from `data` has to discount them by hand.
   */
  const outstandingRemovals = React.useMemo(() => new Set(shown.removals.map(removal => removal.relationId)), [shown]);

  const pendingOrgIds = React.useMemo(() => pendingOrganizationIds(shown), [shown]);

  const { data: pendingAvatars } = useQuery({
    queryKey: entityAvatarsQueryKey(pendingOrgIds),
    enabled: pendingOrgIds.length > 0,
    queryFn: () => fetchEntityAvatars(pendingOrgIds),
    staleTime: 60_000,
  });

  /**
   * The saved edge for an organisation already on the profile.
   *
   * "Add another role here" supplies one, because it was clicked on a card. The
   * section's own button does not, so picking an employer that is already listed
   * would open a second Employment edge to it — the thing one-edge-per-employer
   * exists to prevent.
   */
  const savedStintFor = React.useCallback(
    (cards: HistoryCard<HistoryEntry>[], organizationId: string, removed: Set<string>) =>
      cards
        .find(card => card.organization.id === organizationId)
        // Not one already on its way out. The read lags a publish by a minute or
        // two, so an edge deleted by the last edit is still in it — attaching a
        // new row to that one wrote a Roles relation under an Employment edge
        // that no longer existed, and the role published unreachable.
        ?.edges.find(edge => !isPending(edge.relationId) && !removed.has(edge.relationId))?.stintId,
    []
  );

  /** The stint an edit still becoming readable minted for this organisation. */
  const settledStintFor = React.useCallback(
    (kind: Kind, organizationId: string) => {
      for (let index = published.length - 1; index >= 0; index--) {
        const stint = published[index]!.stints[kind][organizationId];
        if (stint !== undefined) return stint;
      }
      return undefined;
    },
    [published]
  );

  /**
   * The saved edge a row at this organisation belongs on, where there is one.
   *
   * Asked wherever a row arrives at an organisation — adding one, or moving one
   * there. Only adding used to ask, so moving a role to an employer already on
   * the profile opened a second Employment edge beside the one that was there.
   */
  const attachmentFor = React.useCallback(
    (kind: Kind, organizationId: string) =>
      savedStintFor(
        kind === 'employment' ? (data?.employment ?? []) : (data?.education ?? []),
        organizationId,
        outstandingRemovals
      ) ??
      // The read is a minute or two behind a publish, and cannot say yet that an
      // employer added in it exists. Without this, adding a second role there
      // before it catches up opens a second edge to the same company.
      //
      // Searched back to front: where the same employer was added twice inside
      // the window, the later edit's edge is the one to join.
      settledStintFor(kind, organizationId),
    [data?.education, data?.employment, outstandingRemovals, savedStintFor, settledStintFor]
  );

  const addPosition = React.useCallback(
    (draft: PositionDraft) => {
      const existingStintId = draft.existingStintId ?? attachmentFor('employment', draft.company.id);
      setPending(current => ({
        ...current,
        positions: [...current.positions, { key: ID.createEntityId(), draft: { ...draft, existingStintId } }],
      }));
    },
    [attachmentFor]
  );

  const addEducation = React.useCallback(
    (draft: EducationDraft) => {
      const existingStintId = draft.existingStintId ?? attachmentFor('education', draft.school.id);
      setPending(current => ({
        ...current,
        education: [...current.education, { key: ID.createEntityId(), draft: { ...draft, existingStintId } }],
      }));
    },
    [attachmentFor]
  );

  /**
   * What removing one row costs.
   *
   * The row alone. Whether the organisation edge above it goes too is not
   * decided here — see `orphanedEdges`, which works it out from the pending
   * state as it finally stands.
   */
  const rowRemoval = React.useCallback(
    (entry: HistoryEntry, kind: Kind): PendingRemoval => ({
      relationId: entry.relationId,
      entityId: entry.tenureId,
      typeId: PROPERTIES[kind].entry,
      spaceId: entry.spaceId,
      subtree: entry.subtree,
    }),
    []
  );

  const removeEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind) => {
      // Never written, so there is nothing to delete — just forget it.
      if (isPending(entry.relationId)) {
        setPending(current => dropPendingAddition(current, entry.relationId));
        return;
      }

      setPending(current => ({ ...current, removals: [...current.removals, rowRemoval(entry, kind)] }));
    },
    [rowRemoval]
  );

  /**
   * Editing a saved row is a replacement: the old row goes, a new one takes its
   * place under the same employer.
   *
   * The tenure is an anonymous relation entity that nothing else points at, so
   * rewriting it and minting a fresh one come to the same thing — and a
   * replacement is the only one of the two that can also move the row to a
   * different company, or clear a date that used to be set.
   */
  const editEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind, draft: PositionDraft | EducationDraft) => {
      const organizationId = 'company' in draft ? draft.company.id : draft.school.id;
      const staysPut = organizationId === card.organization.id;

      // The edge a row hangs off belongs to the organisation it was under. Move
      // the row to a different employer and that edge is the wrong one — kept, it
      // would publish the Roles relation under the company the row just left.
      //
      // The destination may already have an edge of its own, which this row joins
      // rather than opening a second one beside it. Dropping the old edge without
      // asking for the new one is how it used to do exactly that.
      const reattached = {
        ...draft,
        existingStintId: staysPut ? draft.existingStintId : attachmentFor(kind, organizationId),
      };

      if (isPending(entry.relationId)) {
        setPending(current => replacePendingAddition(current, entry.relationId, reattached));
        return;
      }

      // The replacement attaches straight back to the edge when the employer is
      // unchanged. What hung off the row goes either way: the replacement writes
      // its own dates and skills, and the old ones are not merged into them.
      const next = { ...reattached, existingStintId: staysPut ? entry.edge.stintId : reattached.existingStintId };

      setPending(current => ({
        ...current,
        removals: [...current.removals, rowRemoval(entry, kind)],
        positions:
          kind === 'employment'
            ? [...current.positions, { key: ID.createEntityId(), draft: next as PositionDraft }]
            : current.positions,
        education:
          kind === 'education'
            ? [...current.education, { key: ID.createEntityId(), draft: next as EducationDraft }]
            : current.education,
      }));
    },
    [attachmentFor, rowRemoval]
  );

  /**
   * Everything pending, as rows for the modal's Save to publish with its own.
   *
   * Deletions are tombstones — rows carrying `isDeleted` — and a removal produces
   * one for the relation plus one for everything on the entity it carries. The
   * publish layer reads only the id off a tombstone, so these carry the minimum a
   * delete needs rather than the row as it stands in the graph.
   */
  const staged = React.useMemo((): StagedRows & {
    expectation: Expectation | null;
    stints: Record<Kind, Record<string, string>>;
    /** Including the organisation edges derived above, which `pending` never held. */
    removals: PendingRemoval[];
  } => {
    const context = { personEntityId: entityId, spaceId };
    const mint = () => ID.createEntityId();

    const sharedPositions = shareStintsByOrganization(pending.positions, mint);
    const sharedEducation = shareStintsByOrganization(pending.education, mint);

    // Which stint each organisation's rows were written under. Remembered past a
    // publish so a row added at the same employer before the read catches up
    // joins that edge rather than opening a second one to it.
    //
    // Per kind: the same organisation can hold both an Employment record and an
    // Education record, and they are different edges.
    const stints: Record<Kind, Record<string, string>> = { employment: {}, education: {} };
    for (const { draft, newStintId } of sharedPositions) stints.employment[organizationOf(draft).id] = newStintId;
    for (const { draft, newStintId } of sharedEducation) stints.education[organizationOf(draft).id] = newStintId;

    const additions = [
      ...sharedPositions.map(({ draft, newStintId }) => stagePosition(draft, context, newStintId)),
      ...sharedEducation.map(({ draft, newStintId }) => stageEducation(draft, context, newStintId)),
    ];

    const tombstone = (id: string, typeId: string, ownerId: string): Relation => ({
      id,
      entityId: ownerId,
      spaceId,
      renderableType: 'RELATION',
      isDeleted: true,
      type: { id: typeId, name: null },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: ownerId, name: null, value: ownerId },
    });

    const removedRelations: Relation[] = [];
    const removedValues: Value[] = [];

    // Decided against everything outstanding, but only the new ones go out: an
    // edit already published has had its removals published with it.
    const removals = [
      ...pending.removals,
      ...orphanedEdges(data?.employment ?? [], 'employment', shown),
      ...orphanedEdges(data?.education ?? [], 'education', shown),
    ];

    const ours = (rowSpaceId: string | null) => rowSpaceId === null || rowSpaceId === spaceId;

    // The rows and edges a read will show once this lands, as against everything
    // hanging off them, which it does not surface an id for.
    const expectedGone: string[] = [];
    const expectedThere: string[] = [];

    for (const rows of additions) {
      for (const relation of rows.relations) {
        if (VISIBLE_RELATION_TYPES.has(relation.type.id)) expectedThere.push(relation.id);
      }
    }

    for (const removal of removals) {
      // A relation in another space is not ours to delete, and a tombstone for it
      // would be a delete op aimed at a space the row is not in — the edit would
      // report success and change nothing.
      if (!ours(removal.spaceId)) continue;

      expectedGone.push(removal.relationId);
      removedRelations.push(tombstone(removal.relationId, removal.typeId, removal.entityId));

      // The type is not known per row here, and the publish layer does not read
      // one off a tombstone, so the removal's own stands in.
      for (const relation of removal.subtree.relations.filter(row => ours(row.spaceId))) {
        removedRelations.push(tombstone(relation.id, removal.typeId, removal.entityId));
      }

      for (const value of removal.subtree.values.filter(row => ours(row.spaceId))) {
        removedValues.push({
          id: value.id,
          entity: { id: removal.entityId, name: null },
          // The publish layer builds an `unset` from the property id and checks
          // only that the data type is not RELATION, which a value never is. The
          // real type is not worth another round trip to state here.
          property: { id: value.propertyId, name: null, dataType: 'TEXT', renderableType: 'TEXT' },
          spaceId,
          value: '',
          isDeleted: true,
        });
      }
    }

    return {
      values: [...additions.flatMap(rows => rows.values), ...removedValues],
      relations: [...additions.flatMap(rows => rows.relations), ...removedRelations],
      expectation:
        expectedThere.length > 0 || expectedGone.length > 0
          ? { added: expectedThere, removed: expectedGone, since: 0 }
          : null,
      stints,
      removals,
    };
  }, [data?.education, data?.employment, entityId, pending, shown, spaceId]);

  /**
   * The rows this pending state publishes.
   *
   * Held rather than rebuilt per call: staging mints entity ids, so calling it
   * twice for one unchanged edit produced two different sets of rows — and the
   * publish layer reads that as a different edit, throwing away a staged upload
   * and doing it again.
   */
  const stagedRows = React.useMemo(
    (): StagedRows => ({ values: staged.values, relations: staged.relations }),
    [staged]
  );

  const stagePending = React.useCallback(() => stagedRows, [stagedRows]);

  /**
   * The draft behind an unsaved row, for the sheet to reopen on.
   *
   * Rebuilding one from the rendered row loses what the row does not show —
   * notably that the company was created here and still needs naming, which is
   * how an employer ended up on a profile as "Untitled".
   */
  const draftFor = React.useCallback(
    (entry: HistoryEntry) => (isPending(entry.relationId) ? pendingDraftFor(pending, entry.relationId) : undefined),
    [pending]
  );

  /**
   * Called once the save lands.
   *
   * The rows are not dropped here. A published edit takes a minute or two to
   * become readable, so falling back to the graph's answer at this point shows
   * the state from before the save — which reads as the edit having been lost.
   * They are held until a read agrees with them, or until the deadline.
   */
  const settle = React.useCallback(() => {
    const expectation = staged.expectation;

    // The queue empties either way. What was published is not the user's to edit
    // or publish again, and leaving it queued kept Save lit and handed the same
    // relations back to a second proposal.
    setPending(NOTHING_PENDING);
    setPublished(current =>
      expectation === null
        ? current
        : [
            ...current,
            {
              // `staged.removals`, not `pending.removals`: the organisation edges
              // this edit emptied were worked out during staging and were never in
              // the queue. Without them the next edit cannot tell that an edge it
              // can still see in the stale read has already gone.
              rows: { ...pending, removals: staged.removals },
              stints: staged.stints,
              expectation: { ...expectation, since: Date.now() },
            },
          ]
    );
    void queryClient.invalidateQueries({ queryKey });
  }, [pending, queryClient, queryKey, staged.expectation, staged.removals, staged.stints]);

  /**
   * Let go of a published edit once the read catches up with it.
   *
   * Keyed on `dataUpdatedAt` rather than `data`: a refetch that returns the same
   * rows is the ordinary case while waiting, and structural sharing hands back
   * the identical object — which would never re-run this, and never reach the
   * deadline below.
   */
  React.useEffect(() => {
    if (published.length === 0) return;

    const now = Date.now();

    // Each waits for its own read. Two saves inside one window can become
    // readable in either order, and letting go of both because the later one
    // arrived would put the earlier one's rows back to how they were.
    const outstanding = published.filter(record => {
      // Past the deadline the graph wins even though it disagrees. An edit that
      // never lands must not leave the modal insisting on it for the rest of the
      // session.
      if (now - record.expectation.since > INDEXING_DEADLINE_MS) {
        console.warn('[profile-history] gave up waiting for a published edit to be readable', {
          entityId,
          waitedMs: now - record.expectation.since,
        });
        return false;
      }

      return !(data && reflects(data, record.expectation));
    });

    if (outstanding.length !== published.length) setPublished(outstanding);
  }, [published, data, dataUpdatedAt, entityId]);

  /**
   * Nothing survives a change of profile.
   *
   * This hook outlives one by design — the navbar keeps it mounted so a publish
   * the user walked away from still lands — so an edit waiting to become
   * readable would otherwise be shown over somebody else's history, and its
   * minted stints offered to rows at their employers.
   */
  React.useEffect(() => {
    setPending(NOTHING_PENDING);
    setPublished([]);
  }, [entityId]);

  /**
   * Dismissing the modal forgets the draft. An edit already published is not in
   * the draft to forget — it is held separately, and stays on screen until the
   * read catches up with it.
   */
  const discard = React.useCallback(() => setPending(NOTHING_PENDING), []);

  const employment = React.useMemo(
    () => mergePendingEmployment(data?.employment ?? [], shown.positions, shown.removals, pendingAvatars),
    [data?.employment, shown, pendingAvatars]
  );

  const education = React.useMemo(
    () => mergePendingEducation(data?.education ?? [], shown.education, shown.removals, pendingAvatars),
    [data?.education, shown, pendingAvatars]
  );

  return {
    employment: employment as EmploymentCard[],
    education: education as EducationCard[],
    isLoading,
    /**
     * The read failed, so what is on screen is not what is on the profile.
     * Adding against it would duplicate whatever the failure hid.
     */
    isUnavailable: isError,
    hasPendingChanges: hasPendingChanges(pending),
    addPosition,
    addEducation,
    removeEntry,
    editEntry,
    draftFor,
    stagePending,
    settle,
    discard,
  };
}
