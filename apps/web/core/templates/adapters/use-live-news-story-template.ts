'use client';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import type { BreadcrumbItem, EntityListSectionModel, NewsStoryTemplateModel, TemplateDataSource } from '../models';
import {
  TEMPLATE_ONTOLOGY,
  formatOntologyDate,
  outletColorFrom,
  outletInitialsFrom,
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';

/**
 * Live Geo adapter for `NewsStoryTemplate` (`ContentIds.NEWS_STORY_TYPE`).
 *
 * Reads `PUBLISHER_PROPERTY`, `AUTHORS_PROPERTY`, `PUBLISH_DATE_PROPERTY`, `WEB_URL_PROPERTY`,
 * `WEB_ARCHIVE_URL_PROPERTY`, `SOURCES_PROPERTY`, and `TOPICS_PROPERTY` from the graph.
 */
export function useLiveNewsStoryTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<NewsStoryTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

  const model = React.useMemo<NewsStoryTemplateModel | null>(() => {
    if (!entity) return null;

    const headline = entity.name ?? entity.id;
    const publishers = readEntityRelations(entity, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID);
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)
      .map(rel => rel.toEntity.name)
      .filter((name): name is string => Boolean(name));
    const outlet = publishers[0]?.toEntity.name ?? 'News outlet';
    const date = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    const archiveUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_ARCHIVE_URL_PROPERTY_ID) ?? undefined;

    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const sources = readEntityRelations(entity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID);

    const firstTopic = topics[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: headline },
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
      headline,
      outlet,
      outletInitials: outletInitialsFrom(outlet),
      outletColor: outletColorFrom(outlet),
      authors: authors.length > 0 ? authors : undefined,
      date,
      summary: entity.description ?? undefined,
      externalUrl,
      archiveUrl,
      breadcrumbs,
      reportedClaims: [],
      sections,
    };
  }, [entity, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
  };
}
