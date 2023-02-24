import { A, pipe } from '@mobily/ts-belt';
import { memo, useState } from 'react';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { useActionsStore } from '~/modules/action';
import { SquareButton } from '~/modules/design-system/button';
import { Relation } from '~/modules/design-system/icons/relation';
import { Text as TextIcon } from '~/modules/design-system/icons/text';
import { Spacer } from '~/modules/design-system/spacer';
import { Entity, useEntityTable } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { Column } from '~/modules/types';
import { valueTypes } from '~/modules/value-types';
import { DebugTriples } from '../debug/debug-triples';
import { useEditEvents } from '../entity/edit-events';
import { TripleTypeDropdown } from '../entity/triple-type-dropdown';

interface Props {
  column: Column;
  // This spaceId is the spaceId of the attribute, not the current space.
  // We need the attribute spaceId to get the actions for the attribute
  // (since actions are grouped by spaceId) to be able to keep the updated
  // name in sync.
  spaceId?: string;
  entityId: string;
}

export const EditableEntityTableColumnHeader = memo(function EditableEntityTableColumn({
  column,
  spaceId,
  entityId,
}: Props) {
  const { actions, create, update, remove } = useActionsStore(spaceId);
  const { unpublishedColumns } = useEntityTable();

  const localTriples = pipe(
    Triple.fromActions(actions, column.triples),
    A.filter(t => t.entityId === column.id),
    A.uniqBy(t => t.id)
  );

  const localCellTriples = pipe(
    Triple.fromActions(actions, []),
    A.filter(triple => triple.attributeId === column.id)
  );

  // There's some issue where this component is losing focus after changing the value of the input. For now we can work
  // around this issue by using local state.
  const [localName, setLocalName] = useState(Entity.name(localTriples) ?? '');

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: spaceId ?? '',
      entityName: Entity.name(localTriples) ?? '',
    },
    api: {
      create,
      update,
      remove,
    },
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = localTriples.length === 0 ? column.triples : localTriples;
  const nameTriple = Entity.nameTriple(triples);
  const valueTypeTriple = Entity.valueTypeTriple(triples);

  const valueType = Entity.valueType(triples) ?? SYSTEM_IDS.TEXT;

  const isUnpublished = unpublishedColumns.some(unpublishedColumn => unpublishedColumn.id === column.id);

  const onChangeTripleType = (valueType: keyof typeof valueTypes) => {
    if (valueTypeTriple) {
      // Typescript doesn't know that valueTypeTriple is defined for newly created columns.
      send({
        type: 'CHANGE_COLUMN_VALUE_TYPE',
        payload: {
          valueType,
          valueTypeTriple,
          cellTriples: localCellTriples,
        },
      });
    }
  };

  return (
    <div className="flex items-center justify-between w-full">
      <input
        className="text-smallTitle w-full focus:outline-none placeholder:text-grey-02"
        onChange={e => setLocalName(e.currentTarget.value)}
        placeholder="Column name..."
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: nameTriple, name: e.target.value } })}
        value={localName}
      />

      {isUnpublished && (
        <TripleTypeDropdown
          value={<SquareButton as="span" icon={valueType === SYSTEM_IDS.TEXT ? 'text' : 'relation'} />}
          options={[
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <TextIcon />
                  <Spacer width={8} />
                  Text
                </div>
              ),
              disabled: false,
              onClick: () => onChangeTripleType(SYSTEM_IDS.TEXT),
            },
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Relation />
                  <Spacer width={8} />
                  Relation
                </div>
              ),
              disabled: false,
              onClick: () => onChangeTripleType(SYSTEM_IDS.RELATION),
            },
          ]}
        />
      )}
      <DebugTriples triples={triples} />
    </div>
  );
});
