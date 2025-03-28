import { ContentIds, SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';
import { pipe } from 'effect';
import { dedupeWith } from 'effect/Array';
import { useAtomValue, useSetAtom } from 'jotai';
import Image from 'next/legacy/image';

import * as React from 'react';

import { generateSelector, getIsSelected } from '~/core/blocks/data/data-selectors';
import { mergeEntitiesAsync } from '~/core/blocks/data/queries';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getSchemaFromTypeIds, mergeEntityAsync } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';
import { RenderableProperty } from '~/core/types';
import { toRenderables } from '~/core/utils/to-renderables';
import { getImagePath } from '~/core/utils/utils';

import { Checkbox } from '~/design-system/checkbox';
import { Dots } from '~/design-system/dots';
import { EntitySmall } from '~/design-system/icons/entity-small';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { MenuItem } from '~/design-system/menu';

import { sortRenderables } from '~/partials/entity-page/entity-page-utils';

import { editingPropertiesAtom } from '~/atoms';

type Column = {
  id: string;
  name: string | null;
};

export function TableBlockEditPropertiesPanel() {
  const { source } = useSource();
  const isEditingProperties = useAtomValue(editingPropertiesAtom);

  if (!isEditingProperties) {
    return null;
  }

  return source.type === 'RELATIONS' ? <RelationsPropertySelector /> : <DefaultPropertySelector />;
}

function RelationsPropertySelector() {
  const { source } = useSource();
  const { filterState } = useFilters();

  const [selectedEntities, setSelectedEntities] = React.useState<{
    type: 'TO' | 'FROM' | 'SOURCE';
    entityIds: EntityId[];
  } | null>(null);
  const setIsEditingProperties = useSetAtom(editingPropertiesAtom);

  const { data: sourceEntity } = useQuery({
    queryKey: ['entity-for-merging', source],
    queryFn: async () => {
      if (source.type !== 'RELATIONS') {
        return null;
      }

      return await mergeEntityAsync(EntityId(source.value));
    },
  });

  if (sourceEntity === null || sourceEntity === undefined || source.type !== 'RELATIONS') {
    return null;
  }

  // @TODO: This should be stored as a data structure somewhere
  const filteredPropertyId = filterState.find(r => r.columnId === SystemIds.RELATION_TYPE_ATTRIBUTE)?.value;
  const relationIds = sourceEntity.relationsOut.filter(r => r.typeOf.id === filteredPropertyId).map(r => r.id);
  const toIds = sourceEntity.relationsOut.filter(r => r.typeOf.id === filteredPropertyId).map(r => r.toEntity.id);

  const maybeSourceEntityImage = sourceEntity.relationsOut.find(
    r => r.typeOf.id === EntityId(ContentIds.AVATAR_ATTRIBUTE)
  )?.toEntity.value;

  const onBack = () => {
    if (selectedEntities && selectedEntities.entityIds.length > 0) {
      setSelectedEntities(null);
    } else {
      setIsEditingProperties(false);
    }
  };

  return (
    <>
      <MenuItem className="border-b border-grey-02">
        <button onClick={onBack} className="flex w-full items-center gap-2 text-smallButton">
          <LeftArrowLong />
          <span>Back</span>
        </button>
      </MenuItem>
      {selectedEntities ? (
        <PropertySelector where={selectedEntities.type} entityIds={selectedEntities.entityIds} />
      ) : (
        <div className="w-full py-1">
          <MenuItem onClick={() => setSelectedEntities({ type: 'FROM', entityIds: [sourceEntity.id] })}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="relative h-4 w-4 overflow-hidden rounded">
                  <Image
                    src={maybeSourceEntityImage ? getImagePath(maybeSourceEntityImage) : PLACEHOLDER_SPACE_IMAGE}
                    layout="fill"
                  />
                </div>
                {/* <span className="text-footnoteMedium text-grey-04">0 selected</span> */}
              </div>
              <p className="text-button">{sourceEntity.name}</p>
            </div>
          </MenuItem>

          <MenuItem onClick={() => setSelectedEntities({ type: 'SOURCE', entityIds: relationIds })}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="flex h-4 w-4 items-center justify-center rounded bg-grey-04">
                  <RelationSmall color="white" />
                </div>
                {/* <span className="text-footnoteMedium text-grey-04">0 selected</span> */}
              </div>
              <p className="text-button">Relation entity</p>
            </div>
          </MenuItem>
          <MenuItem onClick={() => setSelectedEntities({ type: 'TO', entityIds: toIds })}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="flex h-4 w-4 items-center justify-center rounded bg-grey-04">
                  <EntitySmall color="white" />
                </div>
                {/* <span className="text-footnoteMedium text-grey-04">0 selected</span> */}
              </div>
              <p className="text-button">To</p>
            </div>
          </MenuItem>
        </div>
      )}
    </>
  );
}

function DefaultPropertySelector() {
  const { filterState } = useFilters();
  const { source } = useSource();

  const setIsEditingProperties = useSetAtom(editingPropertiesAtom);

  const { data: availableColumns, isLoading } = useQuery({
    queryKey: ['available-columns', filterState],
    queryFn: async () => {
      const schema = await getSchemaFromTypeIds(
        filterState.filter(f => f.columnId === SystemIds.TYPES_ATTRIBUTE).map(f => f.value)
      );

      return schema;
    },
  });

  if (source.type === 'RELATIONS') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-3">
        <Dots />
      </div>
    );
  }

  return (
    <>
      <MenuItem className="border-b border-grey-02">
        <button
          onClick={() => setIsEditingProperties(false)}
          className="flex w-full items-center gap-2 text-smallButton"
        >
          <LeftArrowLong />
          <span>Back</span>
        </button>
      </MenuItem>
      {availableColumns?.map((column: Column, index: number) => {
        // do not show name column
        if (index === 0) return null;

        return <ToggleColumn key={column.id} column={column} />;
      })}
    </>
  );
}

type PropertySelectorProps = {
  entityIds: EntityId[];
  where: 'TO' | 'FROM' | 'SOURCE';
};

/**
 * Select which properties a user wants to render for the data block.
 * The properties are determined based on which properties exist
 * on a given entity.
 *
 * e.g., if an Entity has a Name, Description, and Spouse, then the
 * user can select Name, Description or Spouse.
 */
function PropertySelector({ entityIds, where }: PropertySelectorProps) {
  const { toggleProperty: setProperty, mapping } = useView();

  const { data: availableProperties, isLoading } = useQuery({
    queryKey: ['rollup-available-properties', entityIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (entityIds.length === 0) {
        return [];
      }

      const entities = await mergeEntitiesAsync({ entityIds, filterState: [] });

      const availableProperties = entities.flatMap(e => {
        return pipe(
          toRenderables({
            entityId: e.id,
            entityName: e.name,
            spaceId: e.spaces[0],
            triples: e.triples,
            relations: e.relationsOut,
          }),
          sortRenderables,
          renderables =>
            renderables
              .map(t => {
                return {
                  id: t.attributeId,
                  name: t.attributeName,
                  renderableType: t.type,
                };
              })
              .filter(t => t.name !== null)
        );
      });

      return dedupeWith(availableProperties, (a, b) => a.id === b.id);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-3">
        <Dots />
      </div>
    );
  }

  if (availableProperties === undefined) {
    return <MenuItem>No available properties</MenuItem>;
  }

  const onSelectProperty = (property: {
    id: string;
    name: string | null;
    renderableType: RenderableProperty['type'];
  }) => {
    const selector = generateSelector(property, where);

    setProperty(
      {
        id: property.id,
        name: property.name,
      },
      selector ?? undefined
    );
  };

  const selectors = [...Object.values(mapping)].filter(s => s !== null);

  return (
    <div>
      {availableProperties.map(p => {
        const isSelected = getIsSelected(selectors, where, p);

        return (
          <MenuItem key={p.id} onClick={() => onSelectProperty(p)}>
            <div className="flex w-full items-center justify-between">
              <span className="text-button text-grey-04">{p.name}</span>
              <Checkbox checked={isSelected} />
            </div>
          </MenuItem>
        );
      })}
    </div>
  );
}

type ToggleColumnProps = {
  column: Column;
};

function ToggleColumn({ column }: ToggleColumnProps) {
  const { toggleProperty: setColumn, shownColumnIds } = useView();
  const isShown = shownColumnIds.includes(column.id);

  const onToggleColumn = async () => {
    setColumn(column);
  };

  return (
    <MenuItem>
      <button
        onClick={onToggleColumn}
        className={cx('flex w-full items-center justify-between gap-2', !isShown && 'text-grey-03')}
      >
        <span>{column.name}</span>
        {isShown ? <Eye /> : <EyeHide />}
      </button>
    </MenuItem>
  );
}
