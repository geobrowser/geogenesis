import {
  DIFFICULTIES,
  type DifficultyKey,
  OPEN_WORKFLOW_STATUS_KEYS,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  difficultyKeyForId,
  isDifficultyKey,
  isWorkflowStatusKey,
  statusKeyForId,
  statusLabelForKey,
} from './labels';
import type { BoardBounty } from './types';

/**
 * Board filter state, round-tripped through URL search params so filtered
 * views are shareable and survive navigating to a bounty and back. Every
 * field has a default that serializes to "absent", keeping URLs minimal.
 */

export type BountySort = 'payout-desc' | 'payout-asc' | 'deadline-asc' | 'updated-desc';
export type BountyGroupBy = 'none' | 'space' | 'status' | 'difficulty' | 'skill' | 'featured';

export type BountyFilters = {
  /** Space id, or null for all participating spaces. */
  spaceIds: readonly string[];
  /** Only bounties tagged Featured (the community tab's "Featured" scope). */
  featuredOnly: boolean;
  /** Statuses shown. Default = the open statuses; an empty set is normalized back to the default. */
  statuses: readonly WorkflowStatusKey[];
  /** Difficulties shown; empty ⇒ any. */
  difficulties: readonly DifficultyKey[];
  /** Skill ids, any of which qualifies; empty ⇒ any. */
  skillIds: readonly string[];
  query: string;
  sort: BountySort;
  groupBy: BountyGroupBy;
};

export const DEFAULT_BOUNTY_FILTERS: BountyFilters = {
  spaceIds: [],
  featuredOnly: false,
  statuses: OPEN_WORKFLOW_STATUS_KEYS,
  difficulties: [],
  skillIds: [],
  query: '',
  sort: 'updated-desc',
  groupBy: 'none',
};

const SORTS: readonly BountySort[] = ['payout-desc', 'payout-asc', 'deadline-asc', 'updated-desc'];
const GROUP_BYS: readonly BountyGroupBy[] = ['none', 'space', 'status', 'difficulty', 'skill', 'featured'];

const ALL_STATUS_KEYS = WORKFLOW_STATUSES.map(s => s.key);

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function readParam(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseBountyFilters(params: RawParams): BountyFilters {
  const space = readParam(params, 'space')?.trim();
  const scope = readParam(params, 'scope')?.trim();
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
    spaceIds: space && space !== 'all' ? [...new Set(space.split(',').filter(Boolean))] : [],
    featuredOnly: scope === 'featured',
    statuses,
    difficulties: difficultyRaw ? [...new Set(difficultyRaw.split(',').filter(isDifficultyKey))] : [],
    skillIds: skill ? [...new Set(skill.split(',').filter(Boolean))] : [],
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
  if (filters.spaceIds.length > 0) params.set('space', filters.spaceIds.join(','));
  if (filters.featuredOnly) params.set('scope', 'featured');
  if (!sameStatusSet(filters.statuses, DEFAULT_BOUNTY_FILTERS.statuses)) {
    params.set('status', sameStatusSet(filters.statuses, ALL_STATUS_KEYS) ? 'all' : filters.statuses.join(','));
  }
  if (filters.difficulties.length > 0) params.set('difficulty', filters.difficulties.join(','));
  if (filters.skillIds.length > 0) params.set('skill', filters.skillIds.join(','));
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
    if (filters.spaceIds.length > 0 && !filters.spaceIds.includes(bounty.spaceId)) return false;
    if (filters.featuredOnly && !bounty.isFeatured) return false;
    if (!statusSet.has(statusKeyForId(bounty.statusId))) return false;
    if (filters.difficulties.length > 0) {
      const key = difficultyKeyForId(bounty.difficultyId);
      if (!key || !filters.difficulties.includes(key)) return false;
    }
    if (filters.skillIds.length > 0 && !bounty.skills.some(skill => filters.skillIds.includes(skill.id))) return false;
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
/**
 * The groups a bounty belongs to for a facet — the same dimensions the
 * filters cover. Single-valued facets give one group; `skill` is
 * multi-valued, so a bounty with several skills appears under each of them.
 */
function groupMemberships(bounty: BoardBounty, groupBy: Exclude<BountyGroupBy, 'none'>) {
  switch (groupBy) {
    case 'space':
      return [{ key: bounty.spaceId, label: bounty.spaceLabel ?? bounty.spaceId }];
    case 'status': {
      const key = statusKeyForId(bounty.statusId);
      return [{ key, label: statusLabelForKey(key) }];
    }
    case 'difficulty':
      return [
        {
          key: difficultyKeyForId(bounty.difficultyId) ?? 'unspecified',
          label: bounty.difficulty ?? 'Unspecified difficulty',
        },
      ];
    case 'skill':
      return bounty.skills.length > 0
        ? bounty.skills.map(skill => ({ key: skill.id, label: skill.name }))
        : [{ key: 'unspecified', label: 'No skills' }];
    case 'featured':
      return bounty.isFeatured ? [{ key: 'featured', label: 'Featured' }] : [{ key: 'other', label: 'Not featured' }];
  }
}

const STATUS_ORDER: readonly string[] = WORKFLOW_STATUSES.map(status => status.key);
const FEATURED_ORDER: readonly string[] = ['featured', 'other'];

export function groupBounties(
  bounties: readonly BoardBounty[],
  groupBy: BountyGroupBy,
  spaceOrder: readonly string[] = []
): BountyGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: 'All bounties', bounties: [...bounties] }];

  const buckets = new Map<string, BountyGroup>();
  for (const bounty of bounties) {
    for (const { key, label } of groupMemberships(bounty, groupBy)) {
      const bucket = buckets.get(key) ?? { key, label, bounties: [] };
      bucket.bounties.push(bounty);
      buckets.set(key, bucket);
    }
  }

  const order: readonly string[] =
    groupBy === 'difficulty'
      ? DIFFICULTY_ORDER
      : groupBy === 'status'
        ? STATUS_ORDER
        : groupBy === 'featured'
          ? FEATURED_ORDER
          : groupBy === 'space'
            ? spaceOrder
            : []; // skill: alphabetical
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  // "Unspecified" buckets always trail; otherwise the facet's own order, then labels.
  const isLast = (key: string) => (key === 'unspecified' ? 1 : 0);
  return [...buckets.values()].sort(
    (a, b) => isLast(a.key) - isLast(b.key) || rank(a.key) - rank(b.key) || a.label.localeCompare(b.label)
  );
}

// -- Community-tab sections ---------------------------------------------------------

/** The community tab's three bounty sections, each a slice of workflow status. */
export type CommunitySection = 'completed' | 'in-progress' | 'available';

export const COMMUNITY_SECTION_STATUSES: Record<CommunitySection, readonly WorkflowStatusKey[]> = {
  completed: ['done'],
  'in-progress': ['in-progress'],
  available: ['todo'],
};

/**
 * Filters for "View all" on a community-tab section: the section's statuses
 * plus whatever the section's own controls had selected (featured scope,
 * difficulty, skill). Sorted newest-first, which is how the sections read.
 */
export function communitySectionFilters(
  section: CommunitySection,
  options: { featuredOnly?: boolean; difficulties?: readonly DifficultyKey[]; skillIds?: readonly string[] } = {}
): BountyFilters {
  return {
    ...DEFAULT_BOUNTY_FILTERS,
    statuses: COMMUNITY_SECTION_STATUSES[section],
    featuredOnly: options.featuredOnly ?? false,
    difficulties: options.difficulties ?? [],
    skillIds: options.skillIds ?? [],
    sort: 'updated-desc',
  };
}

// -- Facet counts ---------------------------------------------------------------------

export type FacetOption<K extends string = string> = { key: K; label: string; count: number };

/**
 * Faceted counts: for each option of one facet, how many items match every
 * OTHER active filter plus that option alone. This answers "if I pick this,
 * how many will I see?" and ignores the facet's own current selection, so a
 * multi-select facet's counts don't collapse to what is already selected.
 * Options are ordered by count (desc), then label — zero-count options last.
 */
export function countFacetOptions<T, K extends string>(
  items: readonly T[],
  options: readonly { key: K; label: string }[],
  matchesOthers: (item: T) => boolean,
  matchesOption: (item: T, key: K) => boolean
): FacetOption<K>[] {
  const candidates = items.filter(matchesOthers);
  return options
    .map(option => ({ ...option, count: candidates.filter(item => matchesOption(item, option.key)).length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type BountyFacet = 'status' | 'difficulty' | 'skill' | 'space';

/**
 * Facet counts for the board's filters, composed with the other current
 * filters. `skills`/`spaces` supply the option universe (collected from the
 * loaded bounties by the caller).
 */
export function bountyFacetCounts(
  bounties: readonly BoardBounty[],
  filters: BountyFilters,
  facet: BountyFacet,
  universe: { skills?: readonly { id: string; name: string }[]; spaces?: readonly { id: string; label: string }[] } = {}
): FacetOption[] {
  switch (facet) {
    case 'status':
      return countFacetOptions(
        bounties,
        WORKFLOW_STATUSES.map(status => ({ key: status.key, label: status.label })),
        bounty => applyBountyFilters([bounty], { ...filters, statuses: WORKFLOW_STATUSES.map(s => s.key) }).length > 0,
        (bounty, key) => statusKeyForId(bounty.statusId) === key
      );
    case 'difficulty':
      return countFacetOptions(
        bounties,
        DIFFICULTIES.map(d => ({ key: d.key, label: d.label })),
        bounty => applyBountyFilters([bounty], { ...filters, difficulties: [] }).length > 0,
        (bounty, key) => difficultyKeyForId(bounty.difficultyId) === key
      );
    case 'skill':
      return countFacetOptions(
        bounties,
        (universe.skills ?? []).map(skill => ({ key: skill.id, label: skill.name })),
        bounty => applyBountyFilters([bounty], { ...filters, skillIds: [] }).length > 0,
        (bounty, key) => bounty.skills.some(skill => skill.id === key)
      );
    case 'space':
      return countFacetOptions(
        bounties,
        (universe.spaces ?? []).map(space => ({ key: space.id, label: space.label })),
        bounty => applyBountyFilters([bounty], { ...filters, spaceIds: [] }).length > 0,
        (bounty, key) => bounty.spaceId === key
      );
  }
}
