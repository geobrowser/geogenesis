import {
  BOUNTY_STATUS_BACKLOG_ID,
  BOUNTY_STATUS_CANCELLED_ID,
  BOUNTY_STATUS_DONE_ID,
  BOUNTY_STATUS_IN_PROGRESS_ID,
  BOUNTY_STATUS_IN_REVIEW_ID,
  BOUNTY_STATUS_TODO_ID,
  EASY_DIFFICULTY_ID,
  HARD_DIFFICULTY_ID,
  MEDIUM_DIFFICULTY_ID,
} from './ontology';

/**
 * Difficulty and workflow status are closed vocabularies (three and six
 * entities respectively, published once with the ontology), so their labels
 * and ordering are hardcoded here instead of fetched. Keys are the stable
 * URL/UI slugs; ids are the on-chain entities.
 */

export type DifficultyKey = 'easy' | 'medium' | 'hard';
export type WorkflowStatusKey = 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'cancelled';

export const DIFFICULTIES: ReadonlyArray<{ key: DifficultyKey; id: string; label: string }> = [
  { key: 'easy', id: EASY_DIFFICULTY_ID, label: 'Easy' },
  { key: 'medium', id: MEDIUM_DIFFICULTY_ID, label: 'Medium' },
  { key: 'hard', id: HARD_DIFFICULTY_ID, label: 'Hard' },
];

export const WORKFLOW_STATUSES: ReadonlyArray<{ key: WorkflowStatusKey; id: string; label: string }> = [
  { key: 'backlog', id: BOUNTY_STATUS_BACKLOG_ID, label: 'Backlog' },
  { key: 'todo', id: BOUNTY_STATUS_TODO_ID, label: 'To do' },
  { key: 'in-progress', id: BOUNTY_STATUS_IN_PROGRESS_ID, label: 'In progress' },
  { key: 'in-review', id: BOUNTY_STATUS_IN_REVIEW_ID, label: 'In review' },
  { key: 'done', id: BOUNTY_STATUS_DONE_ID, label: 'Done' },
  { key: 'cancelled', id: BOUNTY_STATUS_CANCELLED_ID, label: 'Cancelled' },
];

/** A bounty with no workflow-status relation is Backlog by convention (curator-app does the same). */
export const DEFAULT_WORKFLOW_STATUS_KEY: WorkflowStatusKey = 'backlog';

const difficultyById = new Map(DIFFICULTIES.map(d => [d.id, d]));
const difficultyByKey = new Map(DIFFICULTIES.map(d => [d.key, d]));
const statusById = new Map(WORKFLOW_STATUSES.map(s => [s.id, s]));
const statusByKey = new Map(WORKFLOW_STATUSES.map(s => [s.key, s]));

export function difficultyKeyForId(id: string | null | undefined): DifficultyKey | null {
  return id ? (difficultyById.get(id)?.key ?? null) : null;
}

export function difficultyLabelForId(id: string | null | undefined): string | null {
  return id ? (difficultyById.get(id)?.label ?? null) : null;
}

export function difficultyIdForKey(key: DifficultyKey): string {
  return difficultyByKey.get(key)!.id;
}

export function isDifficultyKey(value: string): value is DifficultyKey {
  return difficultyByKey.has(value as DifficultyKey);
}

/** Null/unknown ids resolve to the Backlog default. */
export function statusKeyForId(id: string | null | undefined): WorkflowStatusKey {
  return (id ? statusById.get(id)?.key : undefined) ?? DEFAULT_WORKFLOW_STATUS_KEY;
}

export function statusLabelForKey(key: WorkflowStatusKey): string {
  return statusByKey.get(key)!.label;
}

export function statusIdForKey(key: WorkflowStatusKey): string {
  return statusByKey.get(key)!.id;
}

export function isWorkflowStatusKey(value: string): value is WorkflowStatusKey {
  return statusByKey.has(value as WorkflowStatusKey);
}

/** Statuses a bounty is "open" in — what the board shows by default. */
export const OPEN_WORKFLOW_STATUS_KEYS: readonly WorkflowStatusKey[] = ['backlog', 'todo', 'in-progress', 'in-review'];
