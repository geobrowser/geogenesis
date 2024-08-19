import { SYSTEM_IDS } from '@geogenesis/sdk';
import { pipe } from 'effect';

import * as React from 'react';

import { useTriples } from '~/core/database/triples';
import { Relation } from '~/core/io/dto/entities';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty, Triple, TripleRenderableProperty } from '~/core/types';
import { toRenderables } from '~/core/utils/to-renderables';
import { NavUtils, getImagePath, groupBy } from '~/core/utils/utils';

import { LinkableChip, LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { sortRenderables } from './entity-page-utils';

interface Props {
  triples: Triple[];
  relations: Relation[];
  id: string;
  spaceId: string;
}

export function ReadableEntityPage({ triples: serverTriples, relations, id, spaceId }: Props) {
  const triplesFromSpace = useTriples(
    React.useMemo(() => {
      return { selector: t => t.space === id };
    }, [id])
  );

  const { triples: localTriples } = useEntityPageStore();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && triplesFromSpace.length === 0 ? serverTriples : localTriples;

  const renderables = pipe(
    toRenderables(
      triples,
      // We don't show blocks in the data section
      relations.filter(r => r.typeOf.id !== SYSTEM_IDS.BLOCKS),
      spaceId
    ),
    renderables => sortRenderables(renderables),
    renderables => groupBy(renderables, r => r.attributeId)
  );

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {Object.entries(renderables).map(([attributeId, renderable]) => {
        const isRelation = renderable[0].type === 'RELATION';

        if (isRelation) {
          return <RelationsGroup key={attributeId} relations={renderable as RelationRenderableProperty[]} />;
        }

        return <TriplesGroup key={attributeId} entityId={id} triples={renderable as TripleRenderableProperty[]} />;
      })}
    </div>
  );
}

function TriplesGroup({ entityId, triples }: { entityId: string; triples: TripleRenderableProperty[] }) {
  return (
    <>
      {triples.map((t, index) => {
        return (
          <div key={`${entityId}-${t.attributeId}-${index}`} className="break-words">
            <Text as="p" variant="bodySemibold">
              {triples[0].attributeName || t.attributeId}
            </Text>
            <div className="flex flex-wrap gap-2">
              {triples.map(renderable => {
                switch (renderable.type) {
                  case 'TEXT':
                    return (
                      <Text key={`string-${renderable.attributeId}-${renderable.value}`} as="p">
                        {renderable.value}
                      </Text>
                    );
                  case 'TIME':
                    return <DateField isEditing={false} value={renderable.value} />;
                  case 'URI':
                    return <WebUrlField isEditing={false} value={renderable.value} />;
                  case 'ENTITY': {
                    return (
                      <div key={`entity-${renderable.attributeId}-${renderable.value.value}}`} className="mt-1">
                        <LinkableChip href={NavUtils.toEntity(renderable.spaceId, renderable.value.value)}>
                          {renderable.value.name || renderable.value.value}
                        </LinkableChip>
                      </div>
                    );
                  }
                }
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function RelationsGroup({ relations }: { relations: RelationRenderableProperty[] }) {
  const attributeId = relations[0].attributeId;
  const attributeName = relations[0].attributeName;
  const spaceId = relations[0].spaceId;

  return (
    <>
      <div key={`${attributeId}-${attributeName}`} className="break-words">
        <Link href={NavUtils.toEntity(spaceId, attributeId)}>
          <Text as="p" variant="bodySemibold">
            {attributeName ?? attributeId}
          </Text>
        </Link>
        <div className="flex flex-wrap gap-2">
          {relations.map(r => {
            const relationId = r.relationId;
            const relationName = r.valueName;
            const renderableType = r.renderableType;
            const relationValue = r.value;

            if (renderableType === 'IMAGE') {
              return (
                <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={getImagePath(relationValue ?? '')} />
              );
            }

            return (
              <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
                <LinkableRelationChip
                  entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                  relationHref={NavUtils.toEntity(spaceId, relationId)}
                >
                  {relationName ?? relationId}
                </LinkableRelationChip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
