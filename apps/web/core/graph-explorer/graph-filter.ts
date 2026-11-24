import { normId } from '~/core/utils/norm-id';

import { GRAPH_KINDS, type GraphKind, parseGraphKinds } from './graph-kinds';

/** What the view is about. Independent: an empty space scope keeps the topic lens. */
export type GraphScope = {
  /** The topic's spaces; null means no space filter. */
  spaceIds: readonly string[] | null;
  /** The topic lens: claims must also carry this topic. */
  topicId: string | null;
  /** Where the topic page reads the topic; claims resolve their vote space against it. */
  topicSpaceId: string | null;
};

/** Where `GraphFilter.spaceIds` came from, for copy that says what was searched. */
export type GraphSpaceSource = 'topic' | 'selected' | 'all';

/** What may appear on the graph. `spaceIds` undefined means no space filter. */
export type GraphFilter = {
  spaceIds?: string[];
  spaceSource: GraphSpaceSource;
  /** Node kinds the 3D view may show, in priority order. */
  kinds: readonly GraphKind[];
  /** The topic lens: content on the map and claims in the Claims tab must carry this topic. */
  topicLensId?: string;
};

/** URL overrides. `spaces` (comma-separated ids) replaces the scope's spaces, `addSpaces` widens them. */
export type GraphFilterOverrides = {
  spaces?: string[];
  addSpaces?: string[];
  /** `?kinds=ent,claim` narrows the node kinds. */
  kinds?: GraphKind[];
  /** `?lens=off` (or the older `?claims=all`) lifts the topic lens. */
  lens?: 'off';
};

const OVERRIDE_PARAMS = ['spaces', 'addSpaces'] as const;

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
  if (params.get('lens') === 'off' || params.get('claims') === 'all') overrides.lens = 'off';
  const kinds = parseGraphKinds(params.get('kinds'));
  if (kinds) overrides.kinds = kinds;
  return overrides;
}

/** Scope + defaults + overrides. */
export function resolveGraphFilter(scope: GraphScope | null, overrides: GraphFilterOverrides = {}): GraphFilter {
  const replaced = overrides.spaces && overrides.spaces.length > 0;
  const base = replaced ? overrides.spaces : (scope?.spaceIds ?? undefined);
  const added = Boolean(base && overrides.addSpaces?.length);
  const spaceIds = base ? [...new Set([...base, ...(overrides.addSpaces ?? [])].map(normId))].sort() : undefined;
  const hasSpaces = Boolean(spaceIds && spaceIds.length > 0);

  return {
    spaceIds: hasSpaces ? spaceIds : undefined,
    spaceSource: !hasSpaces ? 'all' : replaced || added ? 'selected' : 'topic',
    kinds: overrides.kinds ?? GRAPH_KINDS,
    topicLensId: scope?.topicId && overrides.lens !== 'off' ? normId(scope.topicId) : undefined,
  };
}

/** Stable key for react-query: same filter, same cache entry. */
export function graphFilterKey(filter: GraphFilter) {
  return [filter.spaceIds?.join(',') ?? '*', filter.spaceSource, filter.kinds.join(','), filter.topicLensId ?? '*'];
}
