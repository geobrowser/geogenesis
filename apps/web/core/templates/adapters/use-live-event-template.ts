'use client';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import type { BreadcrumbItem, EntityListSectionModel, EventTemplateModel, TemplateDataSource } from '../models';
import { TEMPLATE_ONTOLOGY, formatOntologyDate, readEntityRelations, readEntityTextValue } from '../ontology';

/**
 * Live Geo adapter for `EventTemplate` (`ContentIds.NEWS_EVENT_TYPE`).
 *
 * Reads `EVENT_DATE_PROPERTY`, cover image, `TOPICS_PROPERTY`, `SOURCES_PROPERTY`, and
 * `RELATED_ENTITIES_PROPERTY` directly from the entity's GRC-20 values and relations.
 */
export function useLiveEventTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<EventTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

  const model = React.useMemo<EventTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const when = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID)) ?? '';
    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const sources = readEntityRelations(entity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID);
    const related = readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID);

    const firstTopic = topics[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: title },
        ]
      : undefined;

    const sections: EntityListSectionModel[] = [];

    if (sources.length > 0) {
      sections.push({
        id: 'sources',
        title: 'Sources',
        items: sources.map(rel => ({
          id: rel.toEntity.id,
          kind: 'source',
          kindLabel: 'Source',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(spaceId, rel.toEntity.id),
        })),
      });
    }

    if (related.length > 0) {
      sections.push({
        id: 'related',
        title: 'Related entities',
        items: related.map(rel => ({
          id: rel.toEntity.id,
          kind: 'case',
          kindLabel: 'Entity',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(spaceId, rel.toEntity.id),
        })),
      });
    }

    if (topics.length > 0) {
      sections.push({
        id: 'topics',
        title: 'Topics',
        items: topics.map(rel => ({
          id: rel.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(spaceId, rel.toEntity.id),
        })),
      });
    }

    return {
      id: entity.id,
      title,
      when,
      summary: entity.description ?? undefined,
      coverUrl: Entities.cover(entity.relations),
      breadcrumbs,
      claims: [],
      sections,
    };
  }, [entity, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
  };
}
