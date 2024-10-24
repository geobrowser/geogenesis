import * as React from 'react';

import { useRenderables } from '~/core/hooks/use-renderables';
import { Relation, RelationRenderableProperty, Triple, TripleRenderableProperty } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { LinkableChip, LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

interface Props {
  triples: Triple[];
  relations: Relation[];
  id: string;
  spaceId: string;
}

export function ReadableEntityPage({ triples: serverTriples, id }: Props) {
  const { renderablesGroupedByAttributeId: renderables } = useRenderables(serverTriples);

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {Object.entries(renderables).map(([attributeId, renderable]) => {
        const isRelation = renderable[0].type === 'RELATION' || renderable[0].type === 'IMAGE';

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
            const renderableType = r.type;
            const relationValue = r.value;

            if (renderableType === 'IMAGE') {
              const imagePath = getImagePath(relationValue ?? '');
              return <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={imagePath} />;
            }

            return (
              <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
                <LinkableRelationChip
                  isEditing={false}
                  entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                  relationHref={NavUtils.toEntity(spaceId, relationId)}
                >
                  {relationName ?? relationValue}
                </LinkableRelationChip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
