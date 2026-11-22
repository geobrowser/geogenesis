'use client';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  EntityListSectionModel,
  GraphConnectionGroupModel,
  SourceTemplateModel,
  TemplateDataSource,
} from '../models';
import { TEMPLATE_ONTOLOGY, formatOntologyDate, readEntityRelations, readEntityTextValue } from '../ontology';

/**
 * Live Geo adapter for `SourceTemplate` (Official documents, Datasets, Papers, Articles).
 */
export function useLiveSourceTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<SourceTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

  const model = React.useMemo<SourceTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const publishers = readEntityRelations(entity, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID);
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)
      .map(rel => rel.toEntity.name)
      .filter((name): name is string => Boolean(name));
    const publisher = publishers[0]?.toEntity.name ?? (authors.length > 0 ? authors.join(', ') : undefined);
    const date = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    const sourceType = entity.types.find(type => Boolean(type.name))?.name ?? 'Document';

    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
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

    const metadata: { label: string; value: string }[] = [
      ...(publisher ? [{ label: 'Publisher', value: publisher }] : []),
      ...(date ? [{ label: 'Date', value: date }] : []),
      { label: 'Type', value: sourceType },
    ];

    const sections: EntityListSectionModel[] = [];
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

    const contextGroupsMap = new Map<string, GraphConnectionGroupModel['items'][number][]>();
    for (const rel of entity.relations) {
      if (rel.isDeleted) continue;
      if (
        rel.type.id === TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID ||
        rel.type.id === TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID ||
        rel.type.id === TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID
      ) {
        continue;
      }
      const predicate = rel.type.name?.trim();
      const label = rel.toEntity.name?.trim();
      if (!predicate || !label || /^(Types|Cover|Avatar|Blocks|Tabs)$/i.test(predicate)) continue;
      const list = contextGroupsMap.get(predicate) ?? [];
      list.push({
        id: rel.id,
        label,
        kind: 'entity',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
      contextGroupsMap.set(predicate, list);
    }
    const graphConnections: GraphConnectionGroupModel[] = Array.from(contextGroupsMap.entries()).map(
      ([predicate, items]) => ({ predicate, items })
    );

    return {
      id: entity.id,
      title,
      publisher,
      date,
      sourceType,
      summary: entity.description ?? undefined,
      coverUrl: Entities.cover(entity.relations),
      externalUrl,
      breadcrumbs,
      metadata,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      supportedClaims: [],
      sections,
    };
  }, [entity, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
  };
}
