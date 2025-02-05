import { CONTENT_IDS, SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';
import { pipe } from 'effect';
import { dedupeWith } from 'effect/Array';
import { useAtomValue, useSetAtom } from 'jotai';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { mergeEntityAsync, useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';
import { toRenderables } from '~/core/utils/to-renderables';
import { getImagePath } from '~/core/utils/utils';

import { Checkbox } from '~/design-system/checkbox';
import { EntitySmall } from '~/design-system/icons/entity-small';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Relation } from '~/design-system/icons/relation';
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
  const [selectedEntity, setSelectedEntity] = React.useState<EntityId | null>(null);
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
  const filteredPropertyId = filterState.find(r => r.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE)?.value;
  const relationId = sourceEntity.relationsOut.find(r => r.typeOf.id === filteredPropertyId)?.id;
  const toId = sourceEntity.relationsOut.find(r => r.typeOf.id === filteredPropertyId)?.toEntity.id;

  const maybeSourceEntityImage = sourceEntity.relationsOut.find(r => r.typeOf.id === CONTENT_IDS.AVATAR_ATTRIBUTE)
    ?.toEntity.value;

  const onBack = () => {
    if (selectedEntity) {
      setSelectedEntity(null);
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
      {selectedEntity ? (
        <PropertySelector entityId={selectedEntity} />
      ) : (
        <div className="w-full py-1">
          <MenuItem onClick={() => setSelectedEntity(sourceEntity.id)}>
            <div className="space-y-1">
              <p className="text-button">{sourceEntity.name}</p>
              <div className="flex items-center gap-1">
                <div className="relative h-4 w-4 overflow-hidden rounded">
                  <Image
                    src={maybeSourceEntityImage ? getImagePath(maybeSourceEntityImage) : PLACEHOLDER_SPACE_IMAGE}
                    layout="fill"
                  />
                </div>
                <span className="text-footnoteMedium text-grey-04">0 selected</span>
              </div>
            </div>
          </MenuItem>

          <MenuItem onClick={() => (relationId ? setSelectedEntity(relationId) : undefined)}>
            <div className="space-y-1">
              <p className="text-button">Relation entity</p>
              <div className="flex items-center gap-1">
                <div className="flex h-4 w-4 items-center justify-center rounded bg-grey-04">
                  <RelationSmall color="white" />
                </div>
                <span className="text-footnoteMedium text-grey-04">0 selected</span>
              </div>
            </div>
          </MenuItem>
          <MenuItem onClick={() => (toId ? setSelectedEntity(toId) : undefined)}>
            <div className="space-y-1">
              <p className="text-button">To</p>
              <div className="flex items-center gap-1">
                <div className="flex h-4 w-4 items-center justify-center rounded bg-grey-04">
                  <EntitySmall color="white" />
                </div>
                <span className="text-footnoteMedium text-grey-04">0 selected</span>
              </div>
            </div>
          </MenuItem>
        </div>
      )}
    </>
  );
}

function DefaultPropertySelector() {
  const { properties } = useDataBlock();
  const { source } = useSource();

  const allColumns = properties.map(property => ({
    id: property.id,
    name: property.name,
  }));

  const setIsEditingProperties = useSetAtom(editingPropertiesAtom);

  if (source.type === 'RELATIONS') {
    return null;
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
      {allColumns.map((column: Column, index: number) => {
        // do not show name column
        if (index === 0) return null;

        return <ToggleColumn key={column.id} column={column} />;
      })}
    </>
  );
}

/**
 * Select which properties a user wants to render for the data block.
 * The properties are determined based on which properties exist
 * on a given entity.
 *
 * e.g., if an Entity has a Name, Description, and Spouse, then the
 * user can select Name, Description or Spouse.
 */
function PropertySelector({ entityId }: { entityId: EntityId }) {
  const entity = useEntity({
    id: entityId,
  });

  const availableProperties = pipe(
    toRenderables({
      entityId,
      entityName: entity.name,
      spaceId: entity.spaces[0],
      triples: entity.triples,
      relations: entity.relationsOut,
    }),
    sortRenderables,
    dedupeWith((a, b) => a.attributeId === b.attributeId),
    renderables =>
      renderables
        .map(t => {
          return {
            id: t.attributeId,
            name: t.attributeName,
          };
        })
        .filter(t => t.name !== null)
  );

  return (
    <div>
      {availableProperties.map(p => {
        return (
          <MenuItem key={p.id}>
            <div className="flex items-center justify-between">
              <span className="text-button text-grey-04">{p.name}</span>
              <Checkbox checked={false} />
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
  const { setColumn, shownColumnIds } = useView();
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
