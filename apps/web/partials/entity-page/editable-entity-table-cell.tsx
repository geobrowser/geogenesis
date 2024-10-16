import { SYSTEM_IDS } from '@geogenesis/sdk';

import { memo } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { RenderableProperty, TripleRenderableProperty } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { TableStringField } from '~/design-system/editable-fields/editable-fields';

interface Props {
  entityId: string;
  attributeId: string;
  space: string;
  renderables: RenderableProperty[];
  valueType: string;
  columnName: string;
  columnRelationTypes?: { typeId: string; typeName: string | null }[];
}

export const EditableEntityTableCell = memo(function EditableEntityTableCell({
  space,
  entityId,
  attributeId,
  renderables,
  columnName,
  valueType,
  columnRelationTypes,
}: Props) {
  const entityName = Entities.nameFromRenderable(renderables) ?? '';

  const send = useEditEvents({
    context: {
      entityId: entityId,
      spaceId: space,
      entityName: entityName,
    },
  });

  const isNameCell = attributeId === SYSTEM_IDS.NAME;

  const typesToFilter = columnRelationTypes
    ? columnRelationTypes.length > 0
      ? columnRelationTypes
      : undefined
    : undefined;

  if (isNameCell) {
    // This should exist as there should be a placeholder that exists if no
    // "real" renderable for name exists yet.
    const renderable = renderables[0] as TripleRenderableProperty;

    return (
      <TableStringField
        placeholder="Entity name..."
        value={entityName}
        onBlur={e =>
          send({
            type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            payload: { renderable, value: { type: 'TEXT', value: e.currentTarget.value } },
          })
        }
      />
    );
  }

  return <div className="flex w-full flex-wrap gap-2"></div>;
});
