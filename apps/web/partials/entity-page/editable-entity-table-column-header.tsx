'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';

import { memo, useState } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Column } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { valueTypes } from '~/core/value-types';

import { IconName } from '~/design-system/icon';
import { Date } from '~/design-system/icons/date';
import { Image } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text as TextIcon } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { Spacer } from '~/design-system/spacer';

import { TripleTypeDropdown } from '../entity-page/triple-type-dropdown';

interface Props {
  column: Column;
  // This spaceId is the spaceId of the attribute, not the current space.
  // We need the attribute spaceId to get the actions for the attribute
  // (since actions are grouped by spaceId) to be able to keep the updated
  // name in sync.
  spaceId?: string;
  entityId: string;
  unpublishedColumns: Column[];
}

export const EditableEntityTableColumnHeader = memo(function EditableEntityTableColumn({
  column,
  spaceId,
  entityId,
  unpublishedColumns,
}: Props) {
  const { actionsFromSpace, create, update, remove } = useActionsStore(spaceId);

  const localTriples = pipe(
    Triple.fromActions(actionsFromSpace, column.triples),
    A.filter(t => t.entityId === column.id)
  );

  const localCellTriples = pipe(
    Triple.fromActions(actionsFromSpace, []),
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

  const valueType = Entity.valueTypeId(triples) ?? SYSTEM_IDS.TEXT;

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
    <div className="relative flex w-full items-center justify-between">
      <input
        className="w-full text-smallTitle placeholder:text-grey-02 focus:outline-none"
        onChange={e => setLocalName(e.currentTarget.value)}
        placeholder="Column name..."
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: nameTriple, name: e.target.value } })}
        value={localName}
      />

      {isUnpublished && (
        <TripleTypeDropdown
          value={valueTypes[valueType] as IconName}
          options={[
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <TextIcon />
                  <Spacer width={8} />
                  Text
                </div>
              ),
              value: 'string',
              onClick: () => onChangeTripleType(SYSTEM_IDS.TEXT),
              disabled: false,
            },
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Relation />
                  <Spacer width={8} />
                  Relation
                </div>
              ),
              value: 'entity',
              onClick: () => onChangeTripleType(SYSTEM_IDS.RELATION),
              disabled: false,
            },
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Image />
                  <Spacer width={8} />
                  Image
                </div>
              ),
              value: 'image',
              onClick: () => onChangeTripleType(SYSTEM_IDS.IMAGE),
              disabled: false,
            },
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Date />
                  <Spacer width={8} />
                  Date
                </div>
              ),
              value: 'date',
              onClick: () => onChangeTripleType(SYSTEM_IDS.DATE),
              disabled: false,
            },
            {
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Url />
                  <Spacer width={8} />
                  Web URL
                </div>
              ),
              value: 'url',
              onClick: () => onChangeTripleType(SYSTEM_IDS.WEB_URL),
              disabled: false,
            },
          ]}
        />
      )}
    </div>
  );
});
