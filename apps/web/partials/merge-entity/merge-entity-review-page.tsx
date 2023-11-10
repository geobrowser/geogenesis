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

type SelectedEntityKeysType = {
  [attributeId: string]: Triple | Triple[];
};
interface Props {
  entityId: string;
  triples: Triple[];
  selectedEntityKeys: SelectedEntityKeysType;
  onSelect: (args: { attributeId: string; selectedTriples: Triple[] }) => void;
  mergedEntityId: string;
  setMergedEntityId: (entityId: string) => void;
}

export function MergeEntityReviewPage({
  entityId,
  triples,
  selectedEntityKeys,
  onSelect,
  mergedEntityId,
  setMergedEntityId,
}: Props) {
  const sortedTriples = sortEntityPageTriples(triples, []);

  return (
    <div className="grow rounded border border-grey-02 shadow-button">
      <div
        className={cx(
          mergedEntityId === entityId ? 'bg-white' : 'bg-grey-01 opacity-70',
          'rounded-t border-b border-grey-02 p-5 pb-6'
        )}
      >
        <div className="flex flex-row items-center justify-between">
          <Text as="p" variant="bodySemibold">
            Entity ID
          </Text>
          <div className="flex flex-row items-center gap-2">
            <Text variant="metadataMedium">Merge using this ID</Text>

            <div className="relative flex gap-2">
              <input
                type="checkbox"
                className="peer relative h-6 w-6 shrink-0 appearance-none rounded-sm border-2 border-grey-02 bg-white checked:border-2 checked:text-text checked:accent-white"
                checked={mergedEntityId === entityId}
                onChange={() => setMergedEntityId(entityId)}
              />

              <svg
                className="pointer-events-none absolute hidden h-6 w-6 p-1.5 peer-checked:block"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
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

        const currentSelection = selectedEntityKeys[attributeId] as Triple[] | Triple;

        const isSelectedTriple = (triple: Triple) => triple?.entityId === entityId;

        const isSelected = Array.isArray(currentSelection)
          ? currentSelection.some(isSelectedTriple)
          : isSelectedTriple(currentSelection);

        return (
          <div
            key={`${entityId}-${attributeId}-${index}`}
            className={cx(
              isSelected ? 'bg-white' : 'bg-grey-01 opacity-70',
              'break-words border-b border-grey-02 last:rounded-b last:border-b-0' // no duplicate bottom-borders for the last item
            )}
          >
            <div className="p-5">
              <div className="flex flex-row items-center justify-between">
                <Text as="p" variant="bodySemibold">
                  {triples[0]?.attributeName || attributeId}
                </Text>
                <div className="relative flex gap-2">
                  <input
                    type="checkbox"
                    className="peer relative h-6 w-6 shrink-0 appearance-none rounded-sm border-2 border-grey-02 bg-white checked:border-2 checked:text-text checked:accent-white"
                    checked={isSelected}
                    onChange={() => onSelect({ attributeId: attributeId, selectedTriples: triples })}
                  />
                  <svg
                    className="pointer-events-none absolute hidden h-6 w-6 p-1.5 peer-checked:block"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">{triples.map(tripleToEditableField)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
