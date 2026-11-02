/**
 * The narrowings a claims list carries in the URL.
 *
 * `list` is which source the workspace should open on — the same choice its picker beside search
 * makes. The panel maps its active tab into that param on expand. Validated against what the
 * picker offers, so a stale or hand-typed value falls back rather than naming a list the surface
 * cannot show.
 */
export type ClaimsFilterParams = {
  readonly list: string | null;
  readonly search: string;
  readonly spaceIds: readonly string[];
  readonly topicIds: readonly string[];
};

const LIST = 'list';
const SEARCH = 'q';
const SPACES = 'spaces';
const TOPICS = 'topics';

/** Omit empty dimensions so an unfiltered list is a bare `/matchmaking`. */
export function toClaimsFilterSearch(filters: ClaimsFilterParams, defaultList?: string): string {
  const params = new URLSearchParams();

  if (filters.list && filters.list !== defaultList) params.set(LIST, filters.list);
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

export function fromClaimsFilterSearch<TList extends string>(
  params: URLSearchParams,
  offered: readonly TList[]
): Omit<ClaimsFilterParams, 'list'> & { list: TList | null } {
  const raw = params.get(LIST);

  return {
    list: offered.find(allowed => allowed === raw) ?? null,
    search: params.get(SEARCH)?.trim() ?? '',
    spaceIds: idList(params.get(SPACES)),
    topicIds: idList(params.get(TOPICS)),
  };
}
