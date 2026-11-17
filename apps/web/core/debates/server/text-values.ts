import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';

/**
 * One text property of a set of entities, in one space: what the publisher reads back to decide
 * what to write (a turn block's Markdown, a share card's Image URL). Like `collectRelationTargets`,
 * never a silently truncated list: the publisher acts once on what this returns.
 */
const TEXT_VALUES_SOURCE = /* GraphQL */ `
  query TextValues($ids: [UUID!]!, $propertyId: UUID!, $spaceId: UUID!, $first: Int!) {
    values(
      first: $first
      filter: { entityId: { in: $ids }, propertyId: { is: $propertyId }, spaceId: { is: $spaceId } }
    ) {
      entityId
      text
    }
  }
`;

type TextValuesQuery = { values: Array<{ entityId: string | null; text: string | null } | null> | null };

const textValuesDocument = parse(TEXT_VALUES_SOURCE) as TypedDocumentNode<
  TextValuesQuery,
  { ids: string[]; propertyId: string; spaceId: string; first: number }
>;

export type TextValue = { entityId: string | null; text: string | null };

export type TextValuesRequest = { ids: string[]; propertyId: string; spaceId: string; first: number };

/** One page of values. Injectable for tests. */
export type TextValuesPageFetcher = (request: TextValuesRequest) => Promise<TextValue[]>;

/** Bounded: the callers read a debate's turn blocks (a dozen or so) or its share cards (one or two). */
export const TEXT_VALUES_MAX_IDS = 200;

const fetchPageFromGraph: TextValuesPageFetcher = variables =>
  Effect.runPromise(
    graphql({
      query: textValuesDocument,
      decoder: data => (data.values ?? []).flatMap(value => (value ? [value] : [])),
      variables,
    })
  );

/**
 * The property's values on the entities, in the space: one page, one row past the most there can
 * be (one value per entity). Throws when there are more ids than the read allows, or when the page
 * comes back full: it may have been cut short, and a value that is missing must not read as "no
 * value". Throws on a failed read for the same reason.
 */
export async function readTextValues(
  ids: string[],
  propertyId: string,
  spaceId: string,
  fetchPage: TextValuesPageFetcher = fetchPageFromGraph
): Promise<TextValue[]> {
  if (ids.length > TEXT_VALUES_MAX_IDS)
    throw new Error(`Refusing to read values of ${ids.length} entities: the read allows ${TEXT_VALUES_MAX_IDS}.`);
  if (ids.length === 0) return [];
  const first = TEXT_VALUES_MAX_IDS + 1;
  const values = await fetchPage({ ids, propertyId, spaceId, first });
  if (values.length >= first)
    throw new Error(`The values read came back full (${values.length}); refusing to trust it.`);
  return values;
}
