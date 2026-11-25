'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  EntityListSectionModel,
  EventTemplateModel,
  TemplateDataSource,
} from '../models';
import {
  TEMPLATE_ONTOLOGY,
  buildEntityContextMap,
  extractEntityFlags,
  extractGraphConnections,
  formatOntologyDate,
  readClaimKind,
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';
import { sourcesIngestionLink } from './source-ingestion-links';
import { useHydratedSourceCards } from './use-hydrated-source-cards';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useEntityWithViewerSources } from './use-viewer-sources';

/**
 * Live Geo adapter for `EventTemplate` (`ContentIds.NEWS_EVENT_TYPE`).
 *
 * Hydrates `Event date`, `Location`, cover image, `Topics`, `Sources`, `Related entities`,
 * incoming Claims linked to the event, Context graph relations, Flags, and live `useMutate` actions.
 */
export function useLiveEventTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<EventTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);

  const relatedClaimsWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID } }],
      // Only claims in the viewed space.
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId, spaceId]
  );

  const { entities: linkedClaims } = useQueryEntities({ where: relatedClaimsWhere, first: 12 });

  const claimBatchTargets = React.useMemo(
    () => linkedClaims.map(claim => ({ entityId: claim.id, responseKind: 'stance' as const })),
    [linkedClaims]
  );
  const responseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: claimBatchTargets,
    enabled: claimBatchTargets.length > 0,
  });

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: entity?.name ?? entityId,
    spaceId,
    entity,
    ownerKind: 'event',
  });

  // Page-space Sources plus the viewer's own personal-space ones, so a non-member who added a source
  // sees it (GEO-3819).
  const sourcesEntity = useEntityWithViewerSources({ entity, entityId, spaceId });
  const sourceSeeds = React.useMemo(
    () =>
      readEntityRelations(sourcesEntity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID).map(rel => ({
        id: rel.toEntity.id,
        name: rel.toEntity.name,
        spaceId: rel.toSpaceId,
      })),
    [sourcesEntity]
  );
  const { items: hydratedSourceCards } = useHydratedSourceCards({
    sources: sourceSeeds,
    spaceId,
  });

  const model = React.useMemo<EventTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const when = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID)) ?? '';
    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const relatedClaimsRels = readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID);

    const firstTopic = topics[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(firstTopic.toSpaceId ?? spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: title },
        ]
      : undefined;

    const claimsById = new Map<string, ClaimSummaryModel>();
    for (const claim of linkedClaims) {
      if (!claim.name) continue;
      const batch = responseBatch.data?.get(claimResponseTargetKey({ entityId: claim.id, responseKind: 'stance' }));
      const pos = batch?.counts.positive ?? 0;
      const neg = batch?.counts.negative ?? 0;
      const total = pos + neg;
      const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
      const isAccepted = total >= 2 && pct !== undefined && (pct >= 75 || pct <= 25);
      claimsById.set(ID.uuidToHex(claim.id), {
        id: claim.id,
        title: claim.name,
        kind: readClaimKind(claim.values),
        overallPercent: pct,
        meta: total > 0 ? [`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`] : undefined,
        split: {
          rows:
            total > 0 && pct !== undefined
              ? [
                  {
                    id: spaceId,
                    label: spaceLabel,
                    color: '#202020',
                    percent: pct,
                    voterCount: total,
                    isEveryone: true,
                  },
                ]
              : [],
          isSplit: !isAccepted,
          totalVotes: total > 0 ? total : undefined,
        },
        href: NavUtils.toEntity(resolveEntitySpaceId(claim, spaceId), claim.id),
      });
    }
    for (const rel of relatedClaimsRels) {
      if (!rel.toEntity.name) continue;
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (claimsById.has(hex)) continue;
      claimsById.set(hex, {
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        split: { rows: [], isSplit: true },
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }

    const sections: EntityListSectionModel[] = [];

    // Always drawn, empty or not, with the same shape as the News story's Sources section: every news
    // claim now opens as an Event, and the section's "+" is how its first source gets added.
    sections.push({
      id: 'sources',
      title: 'Sources',
      layout: 'cards',
      emptyText: 'No sources',
      items: hydratedSourceCards,
      ingestionLink: sourcesIngestionLink(entity.id, entity.name, spaceId),
    });

    if (topics.length > 0) {
      sections.push({
        id: 'topics',
        title: 'Topics',
        items: topics.map(rel => ({
          id: rel.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        })),
      });
    }

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      title,
      when,
      summary: entity.description ?? undefined,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      breadcrumbs,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      claims: Array.from(claimsById.values()),
      sections,
    };
  }, [entity, hydratedSourceCards, linkedClaims, responseBatch.data, serverCoverUrl, space?.entity?.name, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
