import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { DEBATE_TAG_ID } from './ontology';

/**
 * Claim list pages for live lobby tabs (GEO-3274).
 *
 * A claim list is a page a curator built out of collection blocks, one per theme, each holding a
 * few hand-picked claims: "AI highlights", "U.S. politics highlights". A page qualifies when the
 * Debate tag sits on it *in the space the page is read from*: the tag relation's own space, never
 * the page's wider `spaceIds`, so tagging someone else's page from another space puts nothing in
 * the picker. Every space qualifies; ranking does the filtering.
 *
 * Blocks, collection items and the tag are all per space, and one page id can live in several
 * spaces with different blocks in each. So everything here is read for one space at a time.
 */

/** The tagged set is small (7 pages across 2 spaces on testnet, Oct 2026); this is a backstop. */
const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 10;
/** `relationsList` stops at 25 unless told otherwise, and a page can hold far more blocks than that. */
const RELATIONS_LIMIT = 500;
/** Curation moves at human speed. */
const CLAIM_LIST_STALE_TIME = 5 * 60_000;

export type ClaimListClaim = { id: string; name: string; description: string | null };
export type ClaimListSection = { id: string; name: string; claims: ClaimListClaim[] };
export type ClaimListPage = { entityId: string; spaceId: string; name: string; sections: ClaimListSection[] };

/** A picker row: one page, as read from one space. */
export type ClaimListOption = {
  entityId: string;
  spaceId: string;
  name: string;
  /** Collection blocks holding at least one claim. */
  themeCount: number;
  claimCount: number;
};

export type ClaimListSpaceGroup = {
  spaceId: string;
  spaceName: string;
  /** The space's score; `null` for a space that has none, which sorts last. */
  score: number | null;
  /** A to Z. */
  options: ClaimListOption[];
};

// ---------------------------------------------------------------------------------------------
// The picker's catalog: every tagged page with its theme and claim counts, grouped by space.

const CATALOG_SOURCE = /* GraphQL */ `
  query ClaimListCatalog(
    $tagPropertyId: UUID!
    $tagId: UUID!
    $claimTypeId: UUID!
    $blocksTypeId: UUID!
    $itemTypeId: UUID!
    $relationsLimit: Int!
    $first: Int!
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $tagPropertyId }
        toEntityId: { is: $tagId }
        fromEntity: { not: { typeIds: { anyEqualTo: $claimTypeId } } }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        spaceId
        fromEntity {
          id
          name
          # Unscoped, because the space differs per node; each row is matched to its tag's space below.
          blocks: relationsList(first: $relationsLimit, filter: { typeId: { is: $blocksTypeId } }) {
            spaceId
            toEntity {
              items: relationsList(first: $relationsLimit, filter: { typeId: { is: $itemTypeId } }) {
                spaceId
                toEntity {
                  typeIds
                }
              }
            }
          }
        }
      }
    }
  }
`;

type CatalogQuery = {
  relationsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: Array<{
      spaceId: string;
      fromEntity: {
        id: string;
        name: string | null;
        blocks: Array<{
          spaceId: string;
          toEntity: { items: Array<{ spaceId: string; toEntity: { typeIds: string[] | null } | null }> | null } | null;
        }> | null;
      } | null;
    } | null> | null;
  } | null;
};

const catalogDocument = parse(CATALOG_SOURCE) as TypedDocumentNode<CatalogQuery, Record<string, unknown>>;

const SPACES_SOURCE = /* GraphQL */ `
  query ClaimListSpaces($ids: [UUID!]!) {
    spaces(filter: { id: { in: $ids } }) {
      id
      page {
        name
      }
    }
    spaceScores(filter: { spaceId: { in: $ids } }) {
      spaceId
      score
    }
  }
`;

type SpacesQuery = {
  spaces: Array<{ id: string; page: { name: string | null } | null } | null> | null;
  // `BigFloat`, so a string.
  spaceScores: Array<{ spaceId: string; score: string | null } | null> | null;
};

const spacesDocument = parse(SPACES_SOURCE) as TypedDocumentNode<SpacesQuery, Record<string, unknown>>;

/** One catalog row's counts, from the blocks and items its tag's space holds. */
export function catalogOptions(data: CatalogQuery): ClaimListOption[] {
  return (data.relationsConnection?.nodes ?? []).flatMap(node => {
    const page = node?.fromEntity;
    if (!node || !page) return [];
    const spaceId = uuidToHex(node.spaceId);
    let themeCount = 0;
    let claimCount = 0;
    for (const block of page.blocks ?? []) {
      if (uuidToHex(block.spaceId) !== spaceId) continue;
      const claims = (block.toEntity?.items ?? []).filter(
        item => uuidToHex(item.spaceId) === spaceId && isClaim(item.toEntity?.typeIds)
      ).length;
      if (claims === 0) continue;
      themeCount += 1;
      claimCount += claims;
    }
    // A page with no claims in any block has nothing to show as a tab.
    if (themeCount === 0) return [];
    return [
      { entityId: uuidToHex(page.id), spaceId, name: page.name?.trim() || 'Untitled list', themeCount, claimCount },
    ];
  });
}

/**
 * The picker's groups. A page tagged in several spaces is offered once, under the highest-ranked
 * of them, and the tab then reads that space's copy. Spaces by score, highest first, unscored
 * last; pages A to Z within a space.
 */
export function groupClaimListOptions(
  options: ClaimListOption[],
  spaces: ReadonlyMap<string, { name: string; score: number | null }>
): ClaimListSpaceGroup[] {
  const scoreOf = (spaceId: string) => spaces.get(spaceId)?.score ?? null;
  const best = new Map<string, ClaimListOption>();
  for (const option of options) {
    const held = best.get(option.entityId);
    if (!held || compareSpaces(option.spaceId, held.spaceId, scoreOf, spaces) < 0) best.set(option.entityId, option);
  }

  const bySpace = new Map<string, ClaimListOption[]>();
  for (const option of best.values()) {
    const list = bySpace.get(option.spaceId);
    if (list) list.push(option);
    else bySpace.set(option.spaceId, [option]);
  }

  return [...bySpace.entries()]
    .sort(([a], [z]) => compareSpaces(a, z, scoreOf, spaces))
    .map(([spaceId, list]) => ({
      spaceId,
      spaceName: spaces.get(spaceId)?.name ?? 'Unnamed space',
      score: scoreOf(spaceId),
      options: list.sort((a, z) => a.name.localeCompare(z.name, undefined, { sensitivity: 'base' })),
    }));
}

/** Negative when `a` ranks above `z`. Ties fall to the name, then the id, so the order is stable. */
function compareSpaces(
  a: string,
  z: string,
  scoreOf: (spaceId: string) => number | null,
  spaces: ReadonlyMap<string, { name: string }>
) {
  const sa = scoreOf(a);
  const sz = scoreOf(z);
  if (sa !== sz) {
    if (sa === null) return 1;
    if (sz === null) return -1;
    return sz - sa;
  }
  const byName = (spaces.get(a)?.name ?? '').localeCompare(spaces.get(z)?.name ?? '');
  return byName !== 0 ? byName : a.localeCompare(z);
}

/** Groups narrowed to pages whose name matches, keeping the space grouping and order. */
export function searchClaimListGroups(groups: ClaimListSpaceGroup[], query: string): ClaimListSpaceGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return groups;
  return groups.flatMap(group => {
    const options = group.options.filter(option => option.name.toLocaleLowerCase().includes(needle));
    return options.length > 0 ? [{ ...group, options }] : [];
  });
}

async function fetchClaimListCatalog(signal?: AbortSignal): Promise<ClaimListSpaceGroup[]> {
  const options: ClaimListOption[] = [];
  let after: string | null = null;
  for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
    const data: CatalogQuery = await Effect.runPromise(
      graphql({
        query: catalogDocument,
        decoder: (result: CatalogQuery) => result,
        variables: {
          tagPropertyId: TAG_PROPERTY_ID,
          tagId: DEBATE_TAG_ID,
          claimTypeId: CLAIM_TYPE_ID,
          blocksTypeId: SystemIds.BLOCKS,
          itemTypeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
          relationsLimit: RELATIONS_LIMIT,
          first: CATALOG_PAGE_SIZE,
          after,
        },
        signal,
      })
    );
    options.push(...catalogOptions(data));
    const info = data.relationsConnection?.pageInfo;
    if (!info?.hasNextPage || !info.endCursor) break;
    after = info.endCursor;
  }

  const spaceIds = [...new Set(options.map(option => option.spaceId))];
  if (spaceIds.length === 0) return [];
  const spaces = await Effect.runPromise(
    graphql({ query: spacesDocument, decoder: decodeSpaces, variables: { ids: spaceIds }, signal })
  );
  return groupClaimListOptions(options, spaces);
}

export function decodeSpaces(data: SpacesQuery): Map<string, { name: string; score: number | null }> {
  const scores = new Map<string, number>();
  for (const row of data.spaceScores ?? []) {
    const score = row?.score === null || row?.score === undefined ? NaN : Number(row.score);
    if (row && Number.isFinite(score)) scores.set(uuidToHex(row.spaceId), score);
  }
  const spaces = new Map<string, { name: string; score: number | null }>();
  for (const space of data.spaces ?? []) {
    if (!space) continue;
    const id = uuidToHex(space.id);
    spaces.set(id, { name: space.page?.name?.trim() || 'Unnamed space', score: scores.get(id) ?? null });
  }
  for (const [id, score] of scores) if (!spaces.has(id)) spaces.set(id, { name: 'Unnamed space', score });
  return spaces;
}

/** Hosts only: nobody else opens the picker, so nobody else pays for the read. */
export function useClaimListCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ['claim-list-catalog', DEBATE_TAG_ID],
    queryFn: ({ signal }) => fetchClaimListCatalog(signal),
    staleTime: CLAIM_LIST_STALE_TIME,
    enabled,
  });
}

// ---------------------------------------------------------------------------------------------
// One list tab: a page's sections and claims, as one space holds them.

const PAGE_SOURCE = /* GraphQL */ `
  query ClaimListPage($id: UUID!, $spaceId: UUID!, $blocksTypeId: UUID!, $itemTypeId: UUID!, $relationsLimit: Int!) {
    entity(id: $id) {
      id
      name
      blocks: relationsList(
        first: $relationsLimit
        filter: { typeId: { is: $blocksTypeId }, spaceId: { is: $spaceId } }
      ) {
        position
        toEntity {
          id
          name
          items: relationsList(
            first: $relationsLimit
            filter: { typeId: { is: $itemTypeId }, spaceId: { is: $spaceId } }
          ) {
            position
            toEntity {
              id
              name
              description
              typeIds
            }
          }
        }
      }
    }
  }
`;

type PageQuery = {
  entity: {
    id: string;
    name: string | null;
    blocks: Array<{
      position: string | null;
      toEntity: {
        id: string;
        name: string | null;
        items: Array<{
          position: string | null;
          toEntity: { id: string; name: string | null; description: string | null; typeIds: string[] | null } | null;
        }> | null;
      } | null;
    }> | null;
  } | null;
};

const pageDocument = parse(PAGE_SOURCE) as TypedDocumentNode<PageQuery, Record<string, unknown>>;

/**
 * The page's themes in page order, each with its claims in collection order. Text blocks, query
 * blocks and anything in a collection that isn't a claim are left out, and so is a theme left with
 * no claims. `null` when the page is gone.
 */
export function decodeClaimListPage(data: PageQuery, spaceId: string): ClaimListPage | null {
  const page = data.entity;
  if (!page) return null;
  const sections = [...(page.blocks ?? [])].sort(byPosition).flatMap(block => {
    const entity = block.toEntity;
    if (!entity) return [];
    const seen = new Set<string>();
    const claims = [...(entity.items ?? [])].sort(byPosition).flatMap(item => {
      const claim = item.toEntity;
      if (!claim || !isClaim(claim.typeIds)) return [];
      const id = uuidToHex(claim.id);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: claim.name?.trim() ?? '', description: claim.description ?? null }];
    });
    return claims.length > 0
      ? [{ id: uuidToHex(entity.id), name: entity.name?.trim() || 'Untitled theme', claims }]
      : [];
  });
  return { entityId: uuidToHex(page.id), spaceId, name: page.name?.trim() || 'Untitled list', sections };
}

/** Everyone in the lobby reads the tabs it has, so this is per page, never the whole catalog. */
export function useClaimListPage(entityId: string, spaceId: string) {
  const id = uuidToHex(entityId);
  const space = uuidToHex(spaceId);
  return useQuery({
    queryKey: ['claim-list-page', id, space],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: pageDocument,
          decoder: (data: PageQuery) => decodeClaimListPage(data, space),
          variables: {
            id,
            spaceId: space,
            blocksTypeId: SystemIds.BLOCKS,
            itemTypeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
            relationsLimit: RELATIONS_LIMIT,
          },
          signal,
        })
      ),
    staleTime: CLAIM_LIST_STALE_TIME,
    enabled: Boolean(id && space),
  });
}

function isClaim(typeIds: string[] | null | undefined) {
  return (typeIds ?? []).some(typeId => uuidToHex(typeId) === CLAIM_TYPE_ID);
}

/** Blocks and collection items carry a fractional index; absent, they fall to the end. */
function byPosition(a: { position: string | null }, z: { position: string | null }) {
  if (a.position === null || z.position === null) return Number(a.position === null) - Number(z.position === null);
  return a.position < z.position ? -1 : a.position > z.position ? 1 : 0;
}
