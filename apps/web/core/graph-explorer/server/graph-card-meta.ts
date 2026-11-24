import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { cache } from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';
import { normId } from '~/core/utils/norm-id';

import { type GraphCardMeta, decodeGraphCardMeta } from '../graph-card-metadata';

export type RawCardEntity = {
  id: string;
  name: string | null;
  description?: string | null;
  types: Array<{ id: string; name: string | null }> | null;
  relationsList?: Array<{ typeId: string; toEntity: { valuesList: Array<{ text: string | null }> } | null }> | null;
  hidden: Array<{ text: string | null; boolean: boolean | null }> | null;
} | null;

export type GraphCardMetaResponse = { centre: RawCardEntity; topic: RawCardEntity };

const HIDDEN_FIELD = 'hidden: valuesList(filter: { propertyId: { is: $hiddenPropertyId } }) { text boolean }';

const GRAPH_CARD_META_QUERY = parse(/* GraphQL */ `
  query GraphCardMeta(
    $id: UUID!
    $topicId: UUID!
    $hiddenPropertyId: UUID!
    $avatarPropertyId: UUID!
    $coverPropertyId: UUID!
    $imageUrlPropertyId: UUID!
  ) {
    centre: entity(id: $id) {
      id
      name
      description
      types { id name }
      relationsList(filter: { typeId: { in: [$avatarPropertyId, $coverPropertyId] } }) {
        typeId
        toEntity { valuesList(filter: { propertyId: { is: $imageUrlPropertyId } }) { text } }
      }
      ${HIDDEN_FIELD}
    }
    topic: entity(id: $topicId) {
      id
      name
      types { id name }
      ${HIDDEN_FIELD}
    }
  }
`) as TypedDocumentNode<GraphCardMetaResponse, Record<string, unknown>>;

/** One request: what the page's metadata and the card's left column need. Deduped per request. */
export const loadGraphCardMeta = cache(async (entityId: string, topicId: string): Promise<GraphCardMeta | null> => {
  return Effect.runPromise(
    graphql({
      query: GRAPH_CARD_META_QUERY,
      decoder: (response: GraphCardMetaResponse) => decodeGraphCardMeta(response),
      variables: {
        id: normId(entityId),
        topicId: normId(topicId),
        hiddenPropertyId: HIDDEN_PROPERTY_ID,
        avatarPropertyId: AVATAR_PROPERTY_ID,
        coverPropertyId: COVER_PROPERTY_ID,
        imageUrlPropertyId: IMAGE_URL_PROPERTY_ID,
      },
    })
  );
});
