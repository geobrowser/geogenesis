import * as React from 'react';
import { memo } from 'react';

import { Entity } from '~/modules/entity';
import { groupBy, NavUtils } from '~/modules/utils';
import { DeletableChipButton } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { EntityAutocompleteDialog } from '../entity/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '../entity/autocomplete/entity-text-autocomplete';
import { EditEvent, useEditEvents } from '../entity/edit-events';
import { StringField } from '../entity/editable-fields';

interface Props {
  cell: Cell;
  space: string;
  triples: Triple[];
  create: (triple: Triple) => void;
  update: (triple: Triple, oldTriple: Triple) => void;
  remove: (triple: Triple) => void;
}

export const EditableEntityTableCell = memo(function EditableEntityTableCell({
  cell,
  space,
  triples: serverTriples,
  create,
  update,
  remove,
}: Props) {
  const send = useEditEvents({
    context: {
      entityId: cell.entityId,
      spaceId: space,
      entityName: Entity.name(serverTriples) ?? '',
    },
    api: {
      create,
      update,
      remove,
    },
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const triples = serverTriples.length === 0 ? cell.triples : serverTriples;
  const entityName = Entity.name(triples) || '';
  const attributeId = cell.columnId;
  const groupedTriples = groupBy(triples, t => t.attributeId);
  const cellTriples = groupedTriples[attributeId] || [];

  const isEmptyEntity = cellTriples.length === 1 && cellTriples[0].value.type === 'entity' && !cellTriples[0].value.id;
  const entityValueTriples = cellTriples.filter(t => t.value.type === 'entity');
  const isEntityGroup = cellTriples.find(t => t.value.type === 'entity');

  const isNameCell = cell.columnId === 'name';

  const removeOrResetEntityTriple = (triple: Triple) => {
    send({
      type: 'REMOVE_ENTITY',
      payload: {
        triple,
        isLastEntity: groupedTriples[triple.attributeId].length === 1,
      },
    });
  };

  const addEntityValue = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    // If it's an empty triple value
    send({
      type: 'ADD_ENTITY_VALUE',
      payload: {
        triplesByAttributeId: groupedTriples,
        attribute: {
          id: attributeId,
        },
        linkedEntity,
        entityName,
      },
    });
  };

  const tripleToEditableField = (attributeId: string, triple: Triple, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      // String and number shouldn't be hit here because we're only using tripleToEditableField
      // for rendering entity values.
      case 'string':
      case 'number':
        return null;
      case 'entity':
        if (isEmptyEntity) {
          return (
            <EntityTextAutocomplete
              spaceId={space}
              key={`entity-${attributeId}-${triple.value.id}`}
              placeholder="Add value..."
              onDone={result => addEntityValue(attributeId, result)}
              itemIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.id)}
            />
          );
        }

        return (
          <div key={`entity-${triple.value.id}`}>
            <DeletableChipButton
              href={NavUtils.toEntity(space, triple.value.id)}
              onClick={() => removeOrResetEntityTriple(triple)}
            >
              <a>{triple.value.name || triple.value.id}</a>
            </DeletableChipButton>
          </div>
        );
    }
  };

  if (isNameCell) {
    return (
      <StringField
        variant="tableCell"
        placeholder="Entity name..."
        value={entityName}
        onBlur={e => send({ type: 'UPDATE_VALUE', payload: { triple: cellTriples[0], value: e.target.value } })}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isEntityGroup ? (
        <>
          {cellTriples.map(triple => tripleToEditableField(attributeId, triple, isEmptyEntity))}
          {!isEmptyEntity && (
            <EntityAutocompleteDialog
              spaceId={space}
              onDone={entity => addEntityValue(attributeId, entity)}
              entityValueIds={entityValueTriples.map(t => t.value.id)}
            />
          )}
        </>
      ) : (
        // The entity-table-store always has at least one triple for each attribute.
        // If there's no real values it adds a placeholder triple. We only want to
        // allow string values to have a single triple at a time.
        <EditableEntityTableStringCell triple={cellTriples[0]} send={send} />
      )}
    </div>
  );
});

interface EditableEntityTableStringCellProps {
  triple: Triple;
  send: (event: EditEvent) => void;
}

function EditableEntityTableStringCell({ triple, send }: EditableEntityTableStringCellProps) {
  return (
    <StringField
      variant="tableCell"
      placeholder="Add value..."
      onBlur={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
      value={triple.value.type === 'string' ? triple.value.value : ''}
    />
  );
}
