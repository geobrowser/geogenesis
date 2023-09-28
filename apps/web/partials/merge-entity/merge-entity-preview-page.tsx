import { SYSTEM_IDS } from '@geogenesis/ids';

import { Triple } from '~/core/types';
import { NavUtils, groupBy } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from '../entity-page/entity-page-utils';

interface Props {
  entityId: string;
  triples: Triple[];
}

export function MergeEntityPreviewPage({ entityId, triples }: Props) {
  const sortedTriples = sortEntityPageTriples(triples, []);

  return (
    <div className="rounded border border-grey-02 shadow-button">
      <div className="p-5 pb-6 border-b border-grey-02">
        <Text as="p" variant="bodySemibold">
          Entity ID
        </Text>
        {entityId}
      </div>
      <div className="flex flex-col">
        <EntityReviewAttributes entityId={entityId} triples={sortedTriples} />
      </div>
    </div>
  );
}

function EntityReviewAttributes({ entityId, triples }: { entityId: Props['entityId']; triples: Props['triples'] }) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <Text key={`string-${triple.attributeId}-${triple.value.id}-${triple.id}`} as="p">
            {triple.value.value}
          </Text>
        );
      case 'image':
        return (
          <ImageZoom
            key={`image-${triple.attributeId}-${triple.value.id}-${triple.id}`}
            imageSrc={triple.value.value}
          />
        );
      case 'date':
        return <DateField isEditing={false} value={triple.value.value} />;
      case 'url':
        return <WebUrlField isEditing={false} value={triple.value.value} />;
      case 'entity': {
        return (
          <div key={`entity-${triple.attributeId}-${triple.value.id}-${triple.id}`} className="mt-1">
            <LinkableChip href={NavUtils.toEntity(triple.space, triple.value.id)}>
              {triple.value.name || triple.value.id}
            </LinkableChip>
          </div>
        );
      }
      case 'number':
        return null;
    }
  };

  return (
    <>
      {Object.entries(groupedTriples).map(([attributeId, triples], index) => {
        if (attributeId === SYSTEM_IDS.BLOCKS) return null;

        return (
          <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
            <div className="p-5 border-b border-grey-02">
              <Text as="p" variant="bodySemibold">
                {triples[0].attributeName || attributeId}
              </Text>
              <div className="flex flex-wrap gap-2">{triples.map(tripleToEditableField)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
