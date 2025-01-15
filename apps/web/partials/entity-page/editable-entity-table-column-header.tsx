'use client';

import * as React from 'react';
import { memo, useState } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { PropertySchema } from '~/core/types';
import { toRenderables } from '~/core/utils/to-renderables';

import { getRenderableTypeFromValueType, getRenderableTypeSelectorOptions } from './get-renderable-type-options';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface Props {
  column: PropertySchema;
  // This spaceId is the spaceId of the attribute, not the current space.
  // We need the attribute spaceId to get the actions for the attribute
  // (since actions are grouped by spaceId) to be able to keep the updated
  // name in sync.
  spaceId?: string;
  entityId: string;
  unpublishedColumns: PropertySchema[];
}

export const EditableEntityTableColumnHeader = memo(function EditableEntityTableColumn({
  column,
  spaceId,
  entityId,
  unpublishedColumns,
}: Props) {
  // const localTriples = useTriples(
  //   React.useMemo(() => {
  //     return {
  //       selector: t => t.entityId === column.id,
  //     };
  //   }, [column.id])
  // );

  // const localCellTriples = useTriples(
  //   React.useMemo(() => {
  //     return {
  //       selector: t => t.attributeId === column.id,
  //     };
  //   }, [column.id])
  // );

  // There's some issue where this component is losing focus after changing the value of the input. For now we can work
  // around this issue by using local state.
  const [localName, setLocalName] = useState(column.name ?? '');

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: spaceId ?? '',
      entityName: column.name ?? '',
    },
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const valueType = column.valueType;
  const isUnpublished = unpublishedColumns.some(unpublishedColumn => unpublishedColumn.id === column.id);
  const selectorOptions = getRenderableTypeSelectorOptions(
    toRenderables({
      triples: [],
      relations: [],
      spaceId: spaceId ?? '',
      entityId,
      entityName: localName,
    })[0],
    () => {},
    send
  );
  const value = getRenderableTypeFromValueType(valueType);

  return (
    <div className="relative flex w-full items-center justify-between">
      <input
        className="w-full bg-transparent text-smallTitle placeholder:text-grey-02 focus:outline-none"
        onChange={e => setLocalName(e.currentTarget.value)}
        placeholder="Column name..."
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { name: e.target.value } })}
        value={localName}
      />

      {isUnpublished && <RenderableTypeDropdown value={value} options={selectorOptions} />}
    </div>
  );
});
