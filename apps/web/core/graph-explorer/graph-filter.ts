import { normId } from '~/core/utils/norm-id';

import { DEFAULT_EXCLUDE_TYPE_IDS, DEFAULT_INCLUDE_TYPE_IDS, DEFAULT_SPOKE_RELATION_TYPE_IDS } from './ontology';

/**
 * Where the graph may draw from. `spaces` is the topic view; `global` is the later all-graph view.
 */
export type GraphScope = { kind: 'spaces'; spaceIds: readonly string[]; topicId?: string } | { kind: 'global' };

/** What may appear on the graph. `spaceIds` undefined means no space filter. */
export type GraphFilter = {
  spaceIds?: string[];
  includeTypeIds: string[];
  excludeTypeIds: string[];
  relationTypeIds: string[];
  /** Claims tab keeps only claims that also carry this topic. Unset shows every claim about the centre. */
  claimsTopicId?: string;
};

export const DEFAULT_GRAPH_FILTER: Omit<GraphFilter, 'spaceIds'> = {
  includeTypeIds: DEFAULT_INCLUDE_TYPE_IDS,
  excludeTypeIds: DEFAULT_EXCLUDE_TYPE_IDS,
  relationTypeIds: DEFAULT_SPOKE_RELATION_TYPE_IDS,
};

/** URL overrides (comma-separated ids). `spaces` replaces the scope's spaces, `addSpaces` widens them; the rest replace their list. */
export type GraphFilterOverrides = {
  spaces?: string[];
  addSpaces?: string[];
  types?: string[];
  excludeTypes?: string[];
  relations?: string[];
  /** `?claims=all` lifts the topic filter on the Claims tab. */
  claims?: 'all';
};

const OVERRIDE_PARAMS = ['spaces', 'addSpaces', 'types', 'excludeTypes', 'relations'] as const;

const HEX_ID = /^[0-9a-f]{32}$/;

function parseIdList(raw: string | null): string[] | undefined {
  if (raw === null) return undefined;
  const ids = raw
    .split(',')
    .map(part => normId(part.trim()))
    .filter(id => HEX_ID.test(id));
  return [...new Set(ids)];
}

export function parseGraphFilterOverrides(params: Pick<URLSearchParams, 'get'>): GraphFilterOverrides {
  const overrides: GraphFilterOverrides = {};
  for (const key of OVERRIDE_PARAMS) {
    const ids = parseIdList(params.get(key));
    if (ids) overrides[key] = ids;
  }
  if (params.get('claims') === 'all') overrides.claims = 'all';
  return overrides;
}

/** Scope + defaults + overrides. An empty include override keeps the default, never a match-nothing filter. */
export function resolveGraphFilter(scope: GraphScope | null, overrides: GraphFilterOverrides = {}): GraphFilter {
  const scoped = scope?.kind === 'spaces' ? scope.spaceIds : undefined;
  const base = overrides.spaces && overrides.spaces.length > 0 ? overrides.spaces : scoped;
  const spaceIds = base ? [...new Set([...base, ...(overrides.addSpaces ?? [])].map(normId))].sort() : undefined;

  return {
    spaceIds: spaceIds && spaceIds.length > 0 ? spaceIds : undefined,
    includeTypeIds: nonEmpty(overrides.types) ?? DEFAULT_GRAPH_FILTER.includeTypeIds,
    excludeTypeIds: overrides.excludeTypes ?? DEFAULT_GRAPH_FILTER.excludeTypeIds,
    relationTypeIds: nonEmpty(overrides.relations) ?? DEFAULT_GRAPH_FILTER.relationTypeIds,
    claimsTopicId:
      scope?.kind === 'spaces' && scope.topicId && overrides.claims !== 'all' ? normId(scope.topicId) : undefined,
  };
}

function nonEmpty(ids: string[] | undefined) {
  return ids && ids.length > 0 ? ids : undefined;
}

/**
 * The client half of the type filter. The server applies the include list; this re-checks it and
 * applies "exclude wins" for entities carrying both an included and an excluded type.
 */
export function keepNeighbour(typeIds: readonly string[], filter: GraphFilter): boolean {
  const ids = typeIds.map(normId);
  const exclude = new Set(filter.excludeTypeIds.map(normId));
  if (ids.some(id => exclude.has(id))) return false;
  const include = new Set(filter.includeTypeIds.map(normId));
  return ids.some(id => include.has(id));
}

/** Stable key for react-query: same filter, same cache entry. */
export function graphFilterKey(filter: GraphFilter) {
  return [
    filter.spaceIds?.join(',') ?? '*',
    [...filter.includeTypeIds].sort().join(','),
    [...filter.excludeTypeIds].sort().join(','),
    [...filter.relationTypeIds].sort().join(','),
    filter.claimsTopicId ?? '*',
  ];
}
