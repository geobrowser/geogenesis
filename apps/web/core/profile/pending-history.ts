import type {
  EducationCard,
  EducationEntry,
  EmploymentCard,
  EmploymentEntry,
  HistoryCard,
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

/** Forgets an unsaved row. Nothing was written, so there is nothing to delete. */
export function dropPendingAddition(pending: PendingHistory, relationId: string): PendingHistory {
  const key = relationId.slice(PENDING_PREFIX.length);
  return {
    ...pending,
    positions: pending.positions.filter(addition => addition.key !== key),
    education: pending.education.filter(addition => addition.key !== key),
  };
}

function entryFromDraft(
  key: string,
  draft: PositionDraft | EducationDraft,
  subject: { id: string; name: string | null }
): HistoryEntry {
  return {
    relationId: `${PENDING_PREFIX}${key}`,
    tenureId: `${PENDING_PREFIX}${key}-tenure`,
    subject,
    startDate: draft.startDate,
    endDate: draft.endDate,
    description: draft.description.trim() === '' ? null : draft.description,
    isLegacy: false,
  };
}

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
  additions: { key: string; draft: PositionDraft | EducationDraft; entry: TEntry }[],
  removals: PendingRemoval[]
): HistoryCard<TEntry>[] {
  const removed = new Set(removals.map(removal => removal.relationId));

  const cards: HistoryCard<TEntry>[] = saved.map(card => ({
    ...card,
    entries: card.entries.filter(entry => !removed.has(entry.relationId)),
  }));

  const byStint = new Map(cards.map(card => [card.stintId, card] as const));

  for (const addition of additions) {
    const organization =
      'company' in addition.draft
        ? { id: addition.draft.company.id, name: addition.draft.company.name }
        : { id: addition.draft.school.id, name: addition.draft.school.name };

    const existing = addition.draft.existingStintId
      ? byStint.get(addition.draft.existingStintId)
      : cards.find(card => card.organization.id === organization.id && !removed.has(card.relationId));

    // Newest first, matching how the saved rows are sorted. The lookup is by
    // organisation rather than by saved edge, so a second role added at an
    // employer that is itself still unsaved joins the same card instead of
    // producing a duplicate that would only merge after a save and a refetch.
    if (existing) {
      existing.entries = [addition.entry, ...existing.entries];
      continue;
    }

    const card: HistoryCard<TEntry> = {
      relationId: `${PENDING_PREFIX}${addition.key}-card`,
      stintId: `${PENDING_PREFIX}${addition.key}-stint`,
      organization,
      entries: [addition.entry],
    };
    cards.push(card);
  }

  // A card whose rows have all gone is dropped: the organisation edge goes with
  // the last row, so leaving it on screen would promise something the save will
  // not deliver.
  return cards.filter(card => !removed.has(card.relationId) && card.entries.length > 0);
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
      entry: {
        ...entryFromDraft(addition.key, addition.draft, addition.draft.title),
        status: addition.draft.status,
        employmentType: addition.draft.employmentType,
        skills: addition.draft.skills,
      },
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
      entry: {
        ...entryFromDraft(addition.key, addition.draft, addition.draft.degree),
        status: addition.draft.status,
        fields: addition.draft.fields,
      },
    })),
    removals
  );
}
