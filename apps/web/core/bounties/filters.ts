import {
  type DifficultyKey,
  OPEN_WORKFLOW_STATUS_KEYS,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  difficultyKeyForId,
  isDifficultyKey,
  isWorkflowStatusKey,
  statusKeyForId,
} from './labels';
import type { BoardBounty } from './types';

/**
 * Board filter state, round-tripped through URL search params so filtered
 * views are shareable and survive navigating to a bounty and back. Every
 * field has a default that serializes to "absent", keeping URLs minimal.
 */

export type BountySort = 'payout-desc' | 'payout-asc' | 'deadline-asc' | 'updated-desc';
export type BountyGroupBy = 'none' | 'difficulty' | 'space';

export type BountyFilters = {
  /** Space id, or null for all participating spaces. */
  spaceId: string | null;
  /** Statuses shown. Default = the open statuses; an empty set is normalized back to the default. */
  statuses: readonly WorkflowStatusKey[];
  difficulty: DifficultyKey | null;
  skillId: string | null;
  query: string;
  sort: BountySort;
  groupBy: BountyGroupBy;
};

export const DEFAULT_BOUNTY_FILTERS: BountyFilters = {
  spaceId: null,
  statuses: OPEN_WORKFLOW_STATUS_KEYS,
  difficulty: null,
  skillId: null,
  query: '',
  sort: 'updated-desc',
  groupBy: 'none',
};

const SORTS: readonly BountySort[] = ['payout-desc', 'payout-asc', 'deadline-asc', 'updated-desc'];
const GROUP_BYS: readonly BountyGroupBy[] = ['none', 'difficulty', 'space'];

const ALL_STATUS_KEYS = WORKFLOW_STATUSES.map(s => s.key);

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function readParam(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseBountyFilters(params: RawParams): BountyFilters {
  const space = readParam(params, 'space')?.trim();
  const statusRaw = readParam(params, 'status')?.trim();
  const difficultyRaw = readParam(params, 'difficulty')?.trim();
  const skill = readParam(params, 'skill')?.trim();
  const query = readParam(params, 'q')?.trim() ?? '';
  const sortRaw = readParam(params, 'sort')?.trim();
  const groupByRaw = readParam(params, 'groupBy')?.trim();

  let statuses: readonly WorkflowStatusKey[] = DEFAULT_BOUNTY_FILTERS.statuses;
  if (statusRaw === 'all') {
    statuses = ALL_STATUS_KEYS;
  } else if (statusRaw) {
    const parsed = statusRaw.split(',').filter(isWorkflowStatusKey);
    if (parsed.length > 0) statuses = [...new Set(parsed)];
  }

  return {
    spaceId: space && space !== 'all' ? space : null,
    statuses,
    difficulty: difficultyRaw && isDifficultyKey(difficultyRaw) ? difficultyRaw : null,
    skillId: skill && skill.length > 0 ? skill : null,
    query,
    sort:
      sortRaw && (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as BountySort) : DEFAULT_BOUNTY_FILTERS.sort,
    groupBy:
      groupByRaw && (GROUP_BYS as readonly string[]).includes(groupByRaw)
        ? (groupByRaw as BountyGroupBy)
        : DEFAULT_BOUNTY_FILTERS.groupBy,
  };
}

function sameStatusSet(a: readonly WorkflowStatusKey[], b: readonly WorkflowStatusKey[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every(key => bSet.has(key));
}

export function serializeBountyFilters(filters: BountyFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.spaceId) params.set('space', filters.spaceId);
  if (!sameStatusSet(filters.statuses, DEFAULT_BOUNTY_FILTERS.statuses)) {
    params.set('status', sameStatusSet(filters.statuses, ALL_STATUS_KEYS) ? 'all' : filters.statuses.join(','));
  }
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.skillId) params.set('skill', filters.skillId);
  if (filters.query) params.set('q', filters.query);
  if (filters.sort !== DEFAULT_BOUNTY_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.groupBy !== DEFAULT_BOUNTY_FILTERS.groupBy) params.set('groupBy', filters.groupBy);
  return params;
}

export function buildBountiesHref(basePath: string, filters: BountyFilters): string {
  const q = serializeBountyFilters(filters).toString();
  return q ? `${basePath}?${q}` : basePath;
}

// -- Applying filters ------------------------------------------------------------

export function applyBountyFilters(bounties: readonly BoardBounty[], filters: BountyFilters): BoardBounty[] {
  const statusSet = new Set(filters.statuses);
  const needle = filters.query.trim().toLowerCase();

  return bounties.filter(bounty => {
    if (filters.spaceId && bounty.spaceId !== filters.spaceId) return false;
    if (!statusSet.has(statusKeyForId(bounty.statusId))) return false;
    if (filters.difficulty && difficultyKeyForId(bounty.difficultyId) !== filters.difficulty) return false;
    if (filters.skillId && !bounty.skills.some(skill => skill.id === filters.skillId)) return false;
    if (needle) {
      const haystack = `${bounty.name}\n${bounty.description ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function compareNullableNumbers(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  // Nulls always sort last regardless of direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

function deadlineMillis(bounty: BoardBounty): number | null {
  if (!bounty.deadline) return null;
  const ms = Date.parse(bounty.deadline);
  return Number.isFinite(ms) ? ms : null;
}

function updatedMillis(bounty: BoardBounty): number | null {
  if (!bounty.updatedAt) return null;
  const ms = Date.parse(bounty.updatedAt);
  return Number.isFinite(ms) ? ms : null;
}

export function sortBounties(bounties: readonly BoardBounty[], sort: BountySort): BoardBounty[] {
  const sorted = [...bounties];
  const byName = (a: BoardBounty, b: BoardBounty) => a.name.localeCompare(b.name);
  switch (sort) {
    case 'payout-desc':
      return sorted.sort((a, b) => compareNullableNumbers(a.budget, b.budget, 'desc') || byName(a, b));
    case 'payout-asc':
      return sorted.sort((a, b) => compareNullableNumbers(a.budget, b.budget, 'asc') || byName(a, b));
    case 'deadline-asc':
      return sorted.sort((a, b) => compareNullableNumbers(deadlineMillis(a), deadlineMillis(b), 'asc') || byName(a, b));
    case 'updated-desc':
      return sorted.sort((a, b) => compareNullableNumbers(updatedMillis(a), updatedMillis(b), 'desc') || byName(a, b));
  }
}

export type BountyGroup = { key: string; label: string; bounties: BoardBounty[] };

const DIFFICULTY_ORDER: (DifficultyKey | 'unspecified')[] = ['easy', 'medium', 'hard', 'unspecified'];

/**
 * Groups already-filtered-and-sorted bounties. Difficulty groups come in a
 * fixed easy→hard order with unspecified last; space groups follow the order
 * of `spaceOrder` (the participating-space list), unknown spaces last.
 */
export function groupBounties(
  bounties: readonly BoardBounty[],
  groupBy: BountyGroupBy,
  spaceOrder: readonly string[] = []
): BountyGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: 'All bounties', bounties: [...bounties] }];

  const buckets = new Map<string, BountyGroup>();
  for (const bounty of bounties) {
    let key: string;
    let label: string;
    if (groupBy === 'difficulty') {
      key = difficultyKeyForId(bounty.difficultyId) ?? 'unspecified';
      label = bounty.difficulty ?? 'Unspecified difficulty';
    } else {
      key = bounty.spaceId;
      label = bounty.spaceLabel ?? bounty.spaceId;
    }
    const bucket = buckets.get(key) ?? { key, label, bounties: [] };
    bucket.bounties.push(bounty);
    buckets.set(key, bucket);
  }

  const order = groupBy === 'difficulty' ? DIFFICULTY_ORDER : spaceOrder;
  const rank = (key: string) => {
    const index = order.indexOf(key as never);
    return index === -1 ? order.length : index;
  };
  return [...buckets.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}
