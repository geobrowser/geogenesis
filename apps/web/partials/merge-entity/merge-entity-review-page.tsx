// this is the UI for the rendered Entity description in the Move Entity Review -- it is similar to the -entity-page.tsx comoponents
import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';

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
  selectedEntityKeys: Record<string, Triple>;
  onSelect: (args: { attributeId: string; selectedTriple: Triple }) => void;
}

//  @TODO style the checkboxes / create Checkbox component for design system
//  and handle the id checkbox logic similarly to how the triples selection is being done
export function MergeEntityReviewPage({ entityId, triples, selectedEntityKeys, onSelect }: Props) {
  const sortedTriples = sortEntityPageTriples(triples, []);
  console.log('sorted triples', sortedTriples);
  return (
    <div className="rounded border border-grey-02 shadow-button">
      <div className="p-5 pb-6 border-b border-grey-02">
        <div className="flex flex-row items-center justify-between">
          <Text as="p" variant="bodySemibold">
            Entity ID
          </Text>
          <div className="flex flex-row items-center gap-2">
            <Text variant="metadataMedium">Merge using this ID</Text>
            {/* @TODO style checkboxe to match the design */}
            <input type="checkbox" className="w-6 h-6 rounded border-grey-02 focus:ring-2 focus:ring-grey-02" />
          </div>
        </div>
        {entityId}
      </div>
      <div className="flex flex-col">
        <EntityReviewAttributes
          entityId={entityId}
          triples={sortedTriples}
          selectedEntityKeys={selectedEntityKeys}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

// this is the same Entity UI as in the other entity pages
function EntityReviewAttributes({
  entityId,
  triples,
  selectedEntityKeys,
  onSelect,
}: {
  entityId: Props['entityId'];
  triples: Props['triples'];
  selectedEntityKeys: Props['selectedEntityKeys'];
  onSelect: Props['onSelect'];
}) {
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
          <div
            key={`${entityId}-${attributeId}-${index}`}
            className={cx(
              selectedEntityKeys[attributeId] && selectedEntityKeys[attributeId].entityId === entityId
                ? 'bg-white'
                : 'bg-grey-01 opacity-70', // check if this is how this is being done in the design
              'break-words'
            )}
          >
            <div className="p-5 border-b border-grey-02">
              <div className="flex flex-row items-center justify-between">
                <Text as="p" variant="bodySemibold">
                  {triples[0].attributeName || attributeId}
                </Text>
                {/* @TODO style checkboxes to match the design */}
                <input
                  type="checkbox"
                  className="w-6 h-6 rounded border-grey-02 focus:ring-2 focus:ring-grey-02"
                  disabled={
                    selectedEntityKeys[attributeId] &&
                    (selectedEntityKeys[attributeId].entityId !== entityId ||
                      selectedEntityKeys[attributeId].value.id !== triples[0].value.id)
                  }
                  onChange={() => onSelect({ attributeId: attributeId, selectedTriple: triples[0] })}
                />
              </div>
              <div className="flex flex-wrap">{triples.map(tripleToEditableField)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
