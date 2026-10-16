/** The compact entity shape used to rank contextual feeds and count their types. */
export type ExploreCompleteIndexNode = {
  id?: string | null;
  typeIds?: Array<string | null> | null;
  rankingScore?: string | number | null;
  createdAt?: string | number | null;
};

export type ExploreIndexConnection<T> = {
  nodes?: T[] | null;
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
} | null;

/** Shared by entity-first and relation-first reads so ranking and composition cannot drift. */
export const exploreIndexNodeFields = /* GraphQL */ `
  id
  typeIds
  rankingScore
  createdAt
`;
