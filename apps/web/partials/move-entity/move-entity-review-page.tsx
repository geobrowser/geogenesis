// this is the UI for the rendered Entity description in the Move Entity Review -- it is similar to the -entity-page.tsx comoponents
import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Triple } from '~/core/types';
import { NavUtils, groupBy } from '~/core/utils/utils';

import { LinkableChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Text } from '~/design-system/text';

import { sortEntityPageTriples } from '../entity-page/entity-page-utils';

interface Props {
  entityId: string;
  triples: Triple[];
}

export function MoveEntityReviewPage({ entityId, triples }: Props) {
  const sortedTriples = sortEntityPageTriples(triples, []);
  return (
    <div className="rounded border border-grey-02 p-5 shadow-button">
      <div className="pb-6">
        <Text as="p" variant="bodySemibold">
          Entity ID
        </Text>
        {entityId}
      </div>
      <div className="flex flex-col gap-6">
        <EntityReviewAttributes entityId={entityId} triples={sortedTriples} />
      </div>
    </div>
  );
}

// this is the same Entity UI as in the other entity pages
function EntityReviewAttributes({ entityId, triples }: { entityId: Props['entityId']; triples: Props['triples'] }) {
  const groupedTriples = groupBy(triples, t => t.attributeId);

  const tripleToEditableField = (triple: Triple) => {
    switch (triple.value.type) {
      case 'TEXT':
        return (
          <Text key={`string-${triple.attributeId}-${triple.id}`} as="p">
            {triple.value.value}
          </Text>
        );
      case 'TIME':
        return <DateField isEditing={false} value={triple.value.value} />;
      case 'URI':
        return <WebUrlField isEditing={false} value={triple.value.value} />;
      case 'ENTITY': {
        return (
          <div key={`entity-${triple.attributeId}-${triple.id}`} className="mt-1">
            <LinkableChip href={NavUtils.toEntity(triple.space, triple.value.value)}>
              {triple.value.name || triple.value.value}
            </LinkableChip>
          </div>
        );
      }
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
