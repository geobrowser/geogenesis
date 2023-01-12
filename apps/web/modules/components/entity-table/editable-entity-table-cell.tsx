import styled from '@emotion/styled';
import { useActionsStore } from '~/modules/action';
import { Entity, useEntityStore } from '~/modules/entity';
import { groupBy, NavUtils } from '~/modules/utils';
import { DeletableChipButton } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { EntityAutocompleteDialog } from '../entity/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '../entity/autocomplete/entity-text-autocomplete';
import { useEditEvents } from '../entity/edit-events';
import { NumberField, StringField } from '../entity/editable-fields';

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space * 3,
}));

interface Props {
  cell: Cell;
  space: string;
  entityId: string;
}

export const EditableEntityTableCell = ({ cell, space, entityId }: Props) => {
  const { triples: localTriples, update, create, remove } = useEntityStore();
  const { actions } = useActionsStore(space);

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: space,
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
  const triples = localTriples.length === 0 && actions.length === 0 ? cell.triples : localTriples;

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
      case 'string':
        return (
          <StringField
            key={triple.id}
            variant="body"
            placeholder="Add value..."
            onChange={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
            value={triple.value.value}
          />
        );
      case 'number':
        return (
          <NumberField
            key={triple.id}
            placeholder="Add value..."
            onBlur={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
            initialValue={triple.value.value}
          />
        );
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
        color="text"
        placeholder="Entity name..."
        value={entityName}
        onChange={e => send({ type: 'UPDATE_VALUE', payload: { triple: cellTriples[0], value: e.target.value } })}
      />
    );
  }

  return (
    <Entities>
      {cellTriples.map(triple => tripleToEditableField(attributeId, triple, isEmptyEntity))}
      {isEntityGroup && !isEmptyEntity && (
        <EntityAutocompleteDialog
          spaceId={space}
          onDone={entity => addEntityValue(attributeId, entity)}
          entityValueIds={entityValueTriples.map(t => t.value.id)}
        />
      )}
    </Entities>
  );
};
