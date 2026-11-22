'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { TEMPLATE_ONTOLOGY, resolveTemplateImageUrl } from '../ontology';

const TOPIC_MEDIA_BATCH_QUERY = parse(/* GraphQL */ `
  query TemplateTopicMediaBatch($ids: [UUID!]!, $mediaTypeIds: [UUID!]!, $imageUrlPropertyId: UUID!) {
    entities(first: 24, filter: { id: { in: $ids } }) {
      id
      relationsList(first: 4, filter: { typeId: { in: $mediaTypeIds } }) {
        typeId
        toEntity {
          valuesList(first: 4, filter: { propertyId: { is: $imageUrlPropertyId } }) {
            propertyId
            text
          }
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entities?: {
      id: string;
      relationsList?:
        | {
            typeId: string;
            toEntity?: {
              valuesList?: { propertyId: string; text?: string | null }[] | null;
            } | null;
          }[]
        | null;
    }[];
  },
  { ids: string[]; mediaTypeIds: string[]; imageUrlPropertyId: string }
>;

/**
 * Batch-hydrates Topic `Avatar` (preferred) or `Cover` image URLs keyed by normalized hex ID,
 * used by Claim and News story templates to render circular thumbnails inside Topic pills.
 */
export function useTopicMediaBatch(topicIds: readonly string[]) {
  const topicHexIds = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of topicIds) {
      if (!id) continue;
      const hex = ID.uuidToHex(id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      out.push(hex);
    }
    return out.slice(0, 24);
  }, [topicIds]);

  return useQuery({
    queryKey: ['template-topic-media-batch', topicHexIds.join(',')],
    enabled: topicHexIds.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const entities = await Effect.runPromise(
        graphql({
          query: TOPIC_MEDIA_BATCH_QUERY,
          variables: {
            ids: topicHexIds,
            mediaTypeIds: [TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID, SystemIds.COVER_PROPERTY],
            imageUrlPropertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID,
          },
          decoder: data => data.entities ?? [],
        })
      );

      const map = new Map<string, string>();
      for (const item of entities) {
        const rels = item.relationsList ?? [];
        const avatarRel = rels.find(r => ID.equals(r.typeId, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID));
        const coverRel = rels.find(r => ID.equals(r.typeId, SystemIds.COVER_PROPERTY));
        const chosen = avatarRel ?? coverRel;
        const rawUrl = chosen?.toEntity?.valuesList?.find(v =>
          ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID)
        )?.text;
        const resolved = resolveTemplateImageUrl(rawUrl);
        if (resolved) map.set(ID.uuidToHex(item.id), resolved);
      }
      return map;
    },
  });
}
