import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple } from '~/core/types';
import { NavUtils, groupBy } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from './entity-page-utils';

interface Props {
  triples: Triple[];
  id: string;
}

export function ReadableEntityPage({ triples: serverTriples, id }: Props) {
  const { actionsFromSpace } = useActionsStore();
  const { triples: localTriples } = useEntityPageStore();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  const sortedTriples = sortEntityPageTriples(triples, []);

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      <EntityAttributes entityId={id} triples={sortedTriples} />
    </div>
  );
}

function EntityAttributes({ entityId, triples }: { entityId: string; triples: Props['triples'] }) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'TEXT':
        return (
          <Text key={`string-${triple.attributeId}-${triple.value.value}`} as="p">
            {triple.value.value}
          </Text>
        );
      case 'IMAGE':
        return <ImageZoom key={`image-${triple.attributeId}-${triple.value.value}}`} imageSrc={triple.value.image} />;
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
      case 'COLLECTION':
        return triple.value.items.map(i => {
          return (
            <div key={`entity-${triple.attributeId}-${triple.value.value}-${i.value.value}}`} className="mt-1">
              <LinkableChip href={NavUtils.toEntity(triple.space, triple.value.value)}>
                {i.value.type === 'ENTITY' ? i.value.value : i.value.value}
              </LinkableChip>
            </div>
          );
        });
      case 'NUMBER':
        return null;
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
            <Text as="p" variant="bodySemibold">
              {triples[0].attributeName || attributeId}
            </Text>
            <div className="flex flex-wrap gap-2">{triples.map(tripleToEditableField)}</div>
          </div>
        );
      })}
    </>
  );
}
