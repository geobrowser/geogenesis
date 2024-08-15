import { SYSTEM_IDS } from '@geogenesis/sdk';
import Link from 'next/link';

import * as React from 'react';

import { useTriples } from '~/core/database/triples';
import { Relation } from '~/core/io/dto/entities';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableData, Triple, TripleRenderableData } from '~/core/types';
import { toRenderables } from '~/core/utils/to-renderables';
import { NavUtils, getImagePath, groupBy } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from './entity-page-utils';

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

  const sortedTriples = sortEntityPageTriples(triples, []);
  const renderables = groupBy(
    toRenderables(
      sortedTriples,
      // We don't show blocks in the data section
      relations.filter(r => r.typeOf.id !== SYSTEM_IDS.BLOCKS),
      spaceId
    ),
    r => r.attributeId
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-smallTitle">Triples</h3>
        <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
          {Object.entries(renderables).map(([attributeId, renderable]) => {
            const isRelation = renderable[0].type === 'RELATION';

            if (isRelation) {
              return <RelationsGroup key={attributeId} relations={renderable as RelationRenderableData[]} />;
            }

            return <TriplesGroup key={attributeId} entityId={id} triples={renderable as TripleRenderableData[]} />;
          })}
        </div>
      </div>
    </div>
  );
}

function TriplesGroup({ entityId, triples }: { entityId: string; triples: TripleRenderableData[] }) {
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
                  case 'NUMBER':
                    return null;
                }
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function RelationsGroup({ relations }: { relations: RelationRenderableData[] }) {
  const attributeId = relations[0].attributeId;
  const attributeName = relations[0].attributeName;
  const relationId = relations[0].relationId;

  return (
    <>
      <div key={`${attributeId}-${attributeName}`} className="break-words">
        {/* @TODO(relations): Space Id should just be the current space */}
        <Link href={NavUtils.toEntity('ab7d4b9e02f840dab9746d352acb0ac6', relationId)}>
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

            // @TODO: The type of the relation might be an image
            if (renderableType === 'IMAGE') {
              return <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={getImagePath(relationValue)} />;
            }

            return (
              <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
                {/* @TODO: The link should go to the correct space */}
                <LinkableChip href={NavUtils.toEntity('ab7d4b9e02f840dab9746d352acb0ac6', relationId)}>
                  {relationName ?? relationId}
                </LinkableChip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
