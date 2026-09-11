import type {
  EducationCard,
  EducationEntry,
  EmploymentCard,
  EmploymentEntry,
  HistoryCard,
  HistoryEdgeRef,
  HistoryEntry,
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
  removals: PendingRemoval[]
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

    // Newest first, matching how the saved rows are sorted.
    if (existing) {
      existing.entries = [addition.entry(edge), ...existing.entries];
      continue;
    }

    cards.push({ organization, edges: [edge], entries: [addition.entry(edge)] });
  }

  // A card whose rows have all gone is dropped: the organisation edge goes with
  // the last row, so leaving it on screen would promise something the save will
  // not deliver.
  return cards.filter(card => card.entries.length > 0);
}

export function mergePendingEmployment(
  saved: EmploymentCard[],
  additions: PendingAddition<PositionDraft>[],
  removals: PendingRemoval[]
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
      }),
    })),
    removals
  );
}

export function mergePendingEducation(
  saved: EducationCard[],
  additions: PendingAddition<EducationDraft>[],
  removals: PendingRemoval[]
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
    removals
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
