import { SYSTEM_IDS } from '@geogenesis/sdk';
import Link from 'next/link';

import { useTriples } from '~/core/database/triples';
import { Relation } from '~/core/io/dto/entities';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple as ITriple } from '~/core/types';
import { NavUtils, getImagePath, groupBy } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from './entity-page-utils';

interface Props {
  triples: ITriple[];
  relations: Relation[];
  id: string;
}

export function ReadableEntityPage({ triples: serverTriples, relations, id }: Props) {
  const triplesFromSpace = useTriples({
    selector: t => t.space === id,
  });

  const { triples: localTriples } = useEntityPageStore();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && triplesFromSpace.length === 0 ? serverTriples : localTriples;

  const sortedTriples = sortEntityPageTriples(triples, []);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-smallTitle">Triples</h3>
        <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
          <EntityTriples entityId={id} triples={sortedTriples} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-smallTitle">Relations</h3>
        <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
          <EntityRelations relations={relations} />
        </div>
      </div>
    </div>
  );
}

function EntityTriples({ entityId, triples }: { entityId: string; triples: Props['triples'] }) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
            <Text as="p" variant="bodySemibold">
              {triples[0].attributeName || attributeId}
            </Text>
            <div className="flex flex-wrap gap-2">
              {triples.map(t => (
                <Triple key={t.id} triple={t} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function EntityRelations({ relations }: { relations: Relation[] }) {
  const groupedRelations = groupBy(
    relations,
    // relations.filter(r => r.typeOf.id !== SYSTEM_IDS.BLOCKS), // We don't show blocks in the relations section
    r => r.typeOf.id
  );

  const relationNamesById = relations.reduce((map, relation) => {
    map.set(relation.typeOf.id, relation.typeOf.name);
    return map;
  }, new Map<string, string | null>());

  return (
    <>
      {Object.entries(groupedRelations).map(([relationId, relations], index) => {
        const relationName = relationNamesById.get(relationId);

        return (
          <div key={`${relationId}-${index}`} className="break-words">
            <Link href={NavUtils.toEntity('ab7d4b9e02f840dab9746d352acb0ac6', relationId)}>
              <Text as="p" variant="bodySemibold">
                {relationName ?? relationId}
              </Text>
            </Link>
            <div className="flex flex-wrap gap-2">
              {relations.map(r => {
                // @TODO: The type of the relation might be an image
                if (r.toEntity.renderableType === 'IMAGE') {
                  return (
                    <ImageZoom
                      key={`image-${relationId}-${r.toEntity.value}`}
                      imageSrc={getImagePath(r.toEntity.value ?? '')}
                    />
                  );
                }

                return (
                  <div key={`relation-${relationId}-${r.toEntity.id}`} className="mt-1">
                    {/* @TODO: The link should go to the correct space */}
                    <LinkableChip href={NavUtils.toEntity('ab7d4b9e02f840dab9746d352acb0ac6', r.toEntity.id)}>
                      {r.toEntity.name ?? r.toEntity.id}
                    </LinkableChip>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

const Triple = ({ triple }: { triple: ITriple }) => {
  if (!triple.value) {
    return null;
  }

  switch (triple.value.type) {
    case 'TEXT':
      return (
        <Text key={`string-${triple.attributeId}-${triple.value.value}`} as="p">
          {triple.value.value}
        </Text>
      );
    case 'IMAGE':
      return <ImageZoom key={`image-${triple.attributeId}-${triple.value.value}`} imageSrc={triple.value.image} />;
    case 'TIME':
      return <DateField isEditing={false} value={triple.value.value} />;
    case 'URI':
      return <WebUrlField isEditing={false} value={triple.value.value} />;
    case 'ENTITY': {
      return (
        <div key={`entity-${triple.attributeId}-${triple.value.value}}`} className="mt-1">
          <LinkableChip href={NavUtils.toEntity(triple.space, triple.value.value)}>
            {triple.value.name || triple.value.value}
          </LinkableChip>
        </div>
      );
    }
    case 'NUMBER':
      return null;
  }

  return null;
};
