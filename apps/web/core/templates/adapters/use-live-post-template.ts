'use client';

import * as React from 'react';

import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import type { BreadcrumbItem, EntityListSectionModel, PostTemplateModel, TemplateDataSource } from '../models';
import { TEMPLATE_ONTOLOGY, formatOntologyDate, readEntityRelations, readEntityTextValue } from '../ontology';

/**
 * Live Geo adapter for `PostTemplate` (`TWEET_TYPE_ID` / `POST_TYPE_ID`).
 */
export function useLivePostTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<PostTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

  const model = React.useMemo<PostTemplateModel | null>(() => {
    if (!entity) return null;

    const isTweet = entity.types.some(type => ID.equals(type.id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID));
    const platform = isTweet ? 'X' : 'Geo';
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID);
    const authorName = authors[0]?.toEntity.name ?? entity.name ?? 'Post';
    const when = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
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
          { id: entity.id, label: `${authorName} on ${platform}` },
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
      authorName,
      platform,
      when,
      body: entity.description ?? entity.name ?? '',
      externalUrl,
      mediaUrl: Entities.cover(entity.relations),
      breadcrumbs,
      claims: [],
      notes: [],
      sections,
    };
  }, [entity, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
  };
}
