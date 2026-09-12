import {
  type EducationCard,
  type EducationEntry,
  type EmploymentCard,
  type EmploymentEntry,
  type HistoryCard,
  type HistoryEdgeRef,
  type HistoryEntry,
  byMostRecent,
  byMostRecentCard,
} from './normalize-history';
import type { EducationDraft, PositionDraft } from './stage-history';

/**
 * Marks a row that only exists in the modal. Rows carry a relation id everywhere
 * else, so the prefix is what lets removal tell "drop this from the queue" from
 * "queue a delete for something the graph already has".
 */
export const PENDING_PREFIX = 'pending:';

export const isPending = (id: string) => id.startsWith(PENDING_PREFIX);

export type PendingRemoval = { relationId: string; entityId: string; typeId: string };

/** A draft plus the key its synthetic rows are built from. */
export type PendingAddition<TDraft> = { key: string; draft: TDraft };

export type PendingHistory = {
  positions: PendingAddition<PositionDraft>[];
  education: PendingAddition<EducationDraft>[];
  removals: PendingRemoval[];
};

export const NOTHING_PENDING: PendingHistory = { positions: [], education: [], removals: [] };

export function hasPendingChanges(pending: PendingHistory) {
  return pending.positions.length > 0 || pending.education.length > 0 || pending.removals.length > 0;
}

const keyOf = (relationId: string) => relationId.slice(PENDING_PREFIX.length);

/** Forgets an unsaved row. Nothing was written, so there is nothing to delete. */
export function dropPendingAddition(pending: PendingHistory, relationId: string): PendingHistory {
  const key = keyOf(relationId);
  return {
    ...pending,
    positions: pending.positions.filter(addition => addition.key !== key),
    education: pending.education.filter(addition => addition.key !== key),
  };
}

/**
 * Rewrites an unsaved row in place, keeping its key.
 *
 * Editing something never written is just a different draft under the same key —
 * no removal, no second row, and the same position in the list it was already
 * sitting in.
 */
export function replacePendingAddition<TDraft extends PositionDraft | EducationDraft>(
  pending: PendingHistory,
  relationId: string,
  draft: TDraft
): PendingHistory {
  const key = keyOf(relationId);
  const swap = <T>(additions: PendingAddition<T>[]) =>
    additions.map(addition => (addition.key === key ? { ...addition, draft: draft as unknown as T } : addition));

  return { ...pending, positions: swap(pending.positions), education: swap(pending.education) };
}

function entryFromDraft(
  key: string,
  draft: PositionDraft | EducationDraft,
  subject: { id: string; name: string | null },
  edge: HistoryEdgeRef
): HistoryEntry {
  return {
    relationId: `${PENDING_PREFIX}${key}`,
    tenureId: `${PENDING_PREFIX}${key}-tenure`,
    edge,
    subject,
    startDate: draft.startDate,
    endDate: draft.endDate,
    description: draft.description.trim() === '' ? null : draft.description,
    isLegacy: false,
  };
}

const organizationOf = (draft: PositionDraft | EducationDraft) =>
  'company' in draft
    ? { id: draft.company.id, name: draft.company.name }
    : { id: draft.school.id, name: draft.school.name };

/**
 * Saved records with everything still pending folded in, so the list reads as the
 * profile the user is about to have rather than the one they still have.
 *
 * A pending role at a company already listed joins that company's card, and one
 * at a company not listed yet makes a card of its own. Matching is by
 * organisation rather than by saved edge, so two roles added at the same new
 * employer in one sitting group together rather than producing two cards that
 * would merge only after a save and a refetch.
 */
function merge<TEntry extends HistoryEntry>(
  saved: HistoryCard<TEntry>[],
  additions: { key: string; draft: PositionDraft | EducationDraft; entry: (edge: HistoryEdgeRef) => TEntry }[],
  removals: PendingRemoval[],
  /** Organisation avatars, for a card the saved data has nothing to say about. */
  avatars: Record<string, string | null> = {}
): HistoryCard<TEntry>[] {
  const removed = new Set(removals.map(removal => removal.relationId));

  const cards: HistoryCard<TEntry>[] = saved.map(card => ({
    ...card,
    edges: card.edges.filter(edge => !removed.has(edge.relationId)),
    entries: card.entries.filter(entry => !removed.has(entry.relationId)),
  }));

  for (const addition of additions) {
    const organization = organizationOf(addition.draft);
    const existing = cards.find(card => card.organization.id === organization.id);

    // A row added against a card that still has a saved edge hangs off that edge;
    // one at an employer with nothing saved left gets a synthetic edge of its own,
    // which `stagePending` turns into the single Employment relation they share.
    const edge: HistoryEdgeRef = existing?.edges[0] ?? {
      relationId: `${PENDING_PREFIX}${organization.id}-edge`,
      stintId: addition.draft.existingStintId ?? `${PENDING_PREFIX}${organization.id}-stint`,
    };

    if (existing) {
      existing.entries = [...existing.entries, addition.entry(edge)];
      continue;
    }

    cards.push({
      organization,
      edges: [edge],
      // Nothing saved mentions this organisation, so its logo has to be looked up
      // rather than read off an edge. Without it a position looked different
      // before and after saving, which is the one thing the merged view is for.
      avatarUrl: avatars[organization.id] ?? null,
      entries: [addition.entry(edge)],
    });
  }

  // Sorted the way the saved rows are, rather than left in the order they were
  // added: a promotion entered after the job before it is still the newer of the
  // two, and reading as the older one until a save and a refetch was a lie the
  // merged view told about itself.
  for (const card of cards) card.entries = [...card.entries].sort(byMostRecent);

  // A card whose rows have all gone is dropped: the organisation edge goes with
  // the last row, so leaving it on screen would promise something the save will
  // not deliver.
  //
  // Re-sorted after that, because a pending row can make an employer the most
  // recent one — a new job at a new company belongs at the top the moment it is
  // entered, not after a save.
  return cards.filter(card => card.entries.length > 0).sort(byMostRecentCard);
}

export function mergePendingEmployment(
  saved: EmploymentCard[],
  additions: PendingAddition<PositionDraft>[],
  removals: PendingRemoval[],
  avatars?: Record<string, string | null>
): EmploymentCard[] {
  return merge<EmploymentEntry>(
    saved,
    additions.map(addition => ({
      ...addition,
      entry: (edge: HistoryEdgeRef) => ({
        ...entryFromDraft(addition.key, addition.draft, addition.draft.title, edge),
        status: addition.draft.status,
        employmentType: addition.draft.employmentType,
        skills: addition.draft.skills,
        location: addition.draft.location,
        locationType: addition.draft.locationType,
      }),
    })),
    removals,
    avatars
  );
}

export function mergePendingEducation(
  saved: EducationCard[],
  additions: PendingAddition<EducationDraft>[],
  removals: PendingRemoval[],
  avatars?: Record<string, string | null>
): EducationCard[] {
  return merge<EducationEntry>(
    saved,
    additions.map(addition => ({
      ...addition,
      entry: (edge: HistoryEdgeRef) => ({
        ...entryFromDraft(addition.key, addition.draft, addition.draft.degree, edge),
        status: addition.draft.status,
        fields: addition.draft.fields,
      }),
    })),
    removals,
    avatars
  );
}

/**
 * One Employment/Education edge per organisation, across everything pending.
 *
 * Drafts are staged one at a time, and a draft with no `existingStintId` opens an
 * edge of its own — so two roles added at the same new employer in one sitting
 * would publish two edges and read back as two employers. Deciding the stint here
 * rather than inside the staging keeps that grouping in one place.
 */
export function shareStintsByOrganization<TDraft extends PositionDraft | EducationDraft>(
  additions: PendingAddition<TDraft>[],
  mintId: () => string
): { draft: TDraft; newStintId: string }[] {
  const stintByOrganization = new Map<string, string>();

  // An explicit stint wins over a minted one, whichever order the drafts are in:
  // a role added to a saved employer has a real edge to attach to, and the new
  // roles beside it should attach to the same one rather than opening a second.
  for (const addition of additions) {
    const stintId = addition.draft.existingStintId;
    // A pending stint is the placeholder `merge` hands the resting state so rows
    // group on screen. It names nothing in the graph, so it is minted here like
    // any other first role rather than written out as a target.
    if (stintId && !isPending(stintId)) stintByOrganization.set(organizationOf(addition.draft).id, stintId);
  }

  return additions.map(addition => {
    const organizationId = organizationOf(addition.draft).id;
    const shared = stintByOrganization.get(organizationId);
    if (shared) return { draft: { ...addition.draft, existingStintId: shared }, newStintId: shared };

    const minted = mintId();
    stintByOrganization.set(organizationId, minted);
    return { draft: { ...addition.draft, existingStintId: undefined }, newStintId: minted };
  });
}

/**
 * The draft behind an unsaved row, by the relation id the resting state gave it.
 *
 * Editing reopens the sheet on a draft, and rebuilding one from the rendered row
 * loses whatever the row does not display — including whether the company was
 * created here, which is what decides if its name gets written. So the original
 * is handed back rather than reconstructed.
 */
export function pendingDraftFor(
  pending: PendingHistory,
  relationId: string
): PositionDraft | EducationDraft | undefined {
  const key = keyOf(relationId);
  return (
    pending.positions.find(addition => addition.key === key)?.draft ??
    pending.education.find(addition => addition.key === key)?.draft
  );
}

/**
 * The organisations named by pending additions, so their avatars can be fetched.
 *
 * A pending row at an employer already on the profile inherits that card's logo.
 * One at an employer nothing saved mentions has nowhere to read it from, which is
 * why these need looking up separately.
 */
export function pendingOrganizationIds(pending: PendingHistory): string[] {
  return Array.from(
    new Set([
      ...pending.positions.map(addition => addition.draft.company.id),
      ...pending.education.map(addition => addition.draft.school.id),
    ])
  ).filter(id => id !== '');
}
