/**
 * The Claims tab's narrowings, carried in the URL.
 */
export type ClaimsFilterParams = {
  readonly scope: string | null;
  readonly search: string;
  readonly spaceIds: readonly string[];
  readonly topicIds: readonly string[];
};

export const DEFAULT_CLAIMS_SCOPE = 'featured';

const SCOPE = 'scope';
const SEARCH = 'q';
const SPACES = 'spaces';
const TOPICS = 'topics';

/** Omit empty dimensions so an unfiltered list is a bare `/matchmaking`. */
export function toClaimsFilterSearch(filters: ClaimsFilterParams, defaultScope?: string): string {
  const params = new URLSearchParams();

  // The scope the tab opens on is not a narrowing, so it is left off
  if (filters.scope && filters.scope !== defaultScope) params.set(SCOPE, filters.scope);
  const search = filters.search.trim();
  if (search) params.set(SEARCH, search);
  if (filters.spaceIds.length > 0) params.set(SPACES, filters.spaceIds.join(','));
  if (filters.topicIds.length > 0) params.set(TOPICS, filters.topicIds.join(','));

  return params.toString();
}

function idList(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    ),
  ];
}

export function fromClaimsFilterSearch<TScope extends string>(
  params: URLSearchParams,
  allowedScopes: readonly TScope[]
): Omit<ClaimsFilterParams, 'scope'> & { scope: TScope | null } {
  const raw = params.get(SCOPE);
  const scope = allowedScopes.find(allowed => allowed === raw) ?? null;

  return {
    scope,
    search: params.get(SEARCH)?.trim() ?? '',
    spaceIds: idList(params.get(SPACES)),
    topicIds: idList(params.get(TOPICS)),
  };
}
