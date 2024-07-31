import { SYSTEM_IDS } from '@geogenesis/sdk';
import Link from 'next/link';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple as ITriple, Relation } from '~/core/types';
import { NavUtils, groupBy } from '~/core/utils/utils';

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
  const { actionsFromSpace } = useActionsStore();
  const { triples: localTriples } = useEntityPageStore();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  const sortedTriples = sortEntityPageTriples(triples, []);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-smallTitle">Triples</h3>
        <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
          <EntityAttributes entityId={id} triples={sortedTriples} />
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

function EntityAttributes({ entityId, triples }: { entityId: string; triples: Props['triples'] }) {
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
  const groupedRelations = groupBy(relations, r => r.typeOf.id);

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
              {relations.map(r => (
                <div key={`relation-${relationId}-${r.toEntity.id}`} className="mt-1">
                  <LinkableChip href={NavUtils.toEntity('ab7d4b9e02f840dab9746d352acb0ac6', r.toEntity.id)}>
                    {r.toEntity.name ?? r.toEntity.id}
                  </LinkableChip>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

const Triple = ({ triple }: { triple: ITriple }) => {
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
    case 'URL':
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
