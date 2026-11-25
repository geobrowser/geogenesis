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

export interface EntityPreviewSummary {
  imageUrl?: string;
  description?: string;
  typeName?: string;
}

const ENTITY_SUMMARY_BATCH_QUERY = parse(/* GraphQL */ `
  query TemplateEntitySummaryBatch($ids: [UUID!]!, $mediaTypeIds: [UUID!]!, $imageUrlPropertyId: UUID!) {
    entities(first: 48, filter: { id: { in: $ids } }) {
      id
      description
      types {
        name
      }
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
      description?: string | null;
      types?: { name?: string | null }[] | null;
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

function normalizeBatchIds(entityIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of entityIds) {
    if (!id) continue;
    const hex = ID.uuidToHex(id);
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.slice(0, 48);
}

/**
 * Batch-hydrates `Avatar` (preferred) / `Cover` image URL, short description, and primary type name
 * keyed by normalized hex ID. Used for News story side-rail entity cards (People, Projects, Entities)
 * as well as Topic pills and Timeline cards in one combined query.
 */
export function useEntitySummaryBatch(entityIds: readonly string[]) {
  const hexIds = React.useMemo(() => normalizeBatchIds(entityIds), [entityIds]);

  return useQuery({
    queryKey: ['template-entity-summary-batch', hexIds.join(',')],
    enabled: hexIds.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const entities = await Effect.runPromise(
        graphql({
          query: ENTITY_SUMMARY_BATCH_QUERY,
          variables: {
            ids: hexIds,
            mediaTypeIds: [TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID, SystemIds.COVER_PROPERTY],
            imageUrlPropertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID,
          },
          decoder: data => data.entities ?? [],
        })
      );

      const map = new Map<string, EntityPreviewSummary>();
      for (const item of entities) {
        const rels = item.relationsList ?? [];
        const avatarRel = rels.find(r => ID.equals(r.typeId, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID));
        const coverRel = rels.find(r => ID.equals(r.typeId, SystemIds.COVER_PROPERTY));
        const chosen = avatarRel ?? coverRel;
        const rawUrl = chosen?.toEntity?.valuesList?.find(v =>
          ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID)
        )?.text;
        const imageUrl = resolveTemplateImageUrl(rawUrl) ?? undefined;
        const description = item.description?.trim() || undefined;
        const typeName = item.types?.find(t => Boolean(t.name?.trim()))?.name?.trim() || undefined;
        map.set(ID.uuidToHex(item.id), { imageUrl, description, typeName });
      }
      return map;
    },
  });
}

/**
 * Batch-hydrates Topic `Avatar` (preferred) or `Cover` image URLs keyed by normalized hex ID,
 * used by Claim and Source templates to render circular thumbnails inside Topic pills.
 */
export function useTopicMediaBatch(topicIds: readonly string[]) {
  const query = useEntitySummaryBatch(topicIds);

  const data = React.useMemo(() => {
    if (!query.data) return undefined;
    const map = new Map<string, string>();
    for (const [hex, summary] of query.data.entries()) {
      if (summary.imageUrl) map.set(hex, summary.imageUrl);
    }
    return map;
  }, [query.data]);

  return { ...query, data };
}
