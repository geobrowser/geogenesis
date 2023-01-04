import styled from '@emotion/styled';
import { useActionsStore } from '~/modules/action';
import { useEntityStore } from '~/modules/entity';
import { groupBy } from '~/modules/utils';
import { ChipButton } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { useEditEvents } from '../entity/edit-events';
import { NumberField, StringField } from '../entity/editable-fields';
import { EntityTextAutocomplete } from '../entity/entity-text-autocomplete';

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space * 3,
}));

interface Props {
  cell: Cell;
  space: string;
  isExpanded: boolean;
}

export const EditableEntityTableCell = ({ cell, space, isExpanded }: Props) => {
  const { triples: localTriples, update, create, remove } = useEntityStore();
  const { actions } = useActionsStore(space);

  const send = useEditEvents({
    context: {
      entityId: cell.entityId,
      spaceId: space,
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

  // const description = Entity.description(triples);
  // const name = Entity.name(triples) ?? serverName;

  const groupedTriples = groupBy(triples, t => t.attributeId);
  const isEmptyEntity = triples.length === 0;
  // const attributeIds = Object.keys(groupedTriples);
  const entityValueTriples = triples.filter(t => t.value.type === 'entity');

  const onChangeTriple = (type: 'string' | 'entity', triples: Triple[]) => {
    send({
      type: 'CHANGE_TRIPLE_TYPE',
      payload: {
        type,
        triples,
      },
    });
  };

  const removeOrResetEntityTriple = (triple: Triple) => {
    send({
      type: 'REMOVE_ENTITY',
      payload: {
        triple,
        isLastEntity: groupedTriples[triple.attributeId].length === 1,
      },
    });
  };

  const linkAttribute = (oldAttributeId: string, attribute: { id: string; name: string | null }) => {
    send({
      type: 'LINK_ATTRIBUTE',
      payload: {
        triplesByAttributeId: groupedTriples,
        oldAttribute: {
          id: oldAttributeId,
        },
        newAttribute: attribute,
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
        // entityName: name,
        entityName: '',
      },
    });
  };

  const tripleToEditableField = (attributeId: string, triple: Triple, isEmptyEntity: boolean) => {
    switch (triple.value.type) {
      case 'string':
        return (
          <div>
            <StringField
              key={triple.id}
              variant="body"
              placeholder="Add value..."
              onChange={e => send({ type: 'UPDATE_VALUE', payload: { triple, value: e.target.value } })}
              value={triple.value.value}
            />
          </div>
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
              key={`entity-${attributeId}-${triple.value.id}`}
              placeholder="Add value..."
              onDone={result => addEntityValue(attributeId, result)}
              itemIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.id)}
            />
          );
        }

        return (
          <div key={`entity-${triple.value.id}`}>
            <ChipButton icon="check-close" onClick={() => removeOrResetEntityTriple(triple)}>
              {triple.value.name || triple.value.id}
            </ChipButton>
          </div>
        );
    }
  };

  return <Entities>{triples.map(triple => tripleToEditableField(cell.columnId, triple, isEmptyEntity))}</Entities>;
};
