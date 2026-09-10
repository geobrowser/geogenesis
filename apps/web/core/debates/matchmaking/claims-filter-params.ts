/**
 * The narrowings a claims list carries in the URL.
 *
 * Search, spaces and topics only. There is no scope here because there is no longer a scope to
 * carry: which claims a list draws is decided by the tab the viewer is on — Explore, Lobby or
 * Positions — rather than by a control inside it, and the workspace mounts Explore and nothing
 * else. A `scope` param could only name a list this surface has no way to show.
 */
export type ClaimsFilterParams = {
  readonly search: string;
  readonly spaceIds: readonly string[];
  readonly topicIds: readonly string[];
};

const SEARCH = 'q';
const SPACES = 'spaces';
const TOPICS = 'topics';

/** Omit empty dimensions so an unfiltered list is a bare `/matchmaking`. */
export function toClaimsFilterSearch(filters: ClaimsFilterParams): string {
  const params = new URLSearchParams();

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

export function fromClaimsFilterSearch(params: URLSearchParams): ClaimsFilterParams {
  return {
    search: params.get(SEARCH)?.trim() ?? '',
    spaceIds: idList(params.get(SPACES)),
    topicIds: idList(params.get(TOPICS)),
  };
}
