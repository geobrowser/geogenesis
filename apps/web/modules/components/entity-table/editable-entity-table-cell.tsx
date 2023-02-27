import { memo } from 'react';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { Entity, useEntityTable } from '~/modules/entity';
import { NavUtils } from '~/modules/utils';
import { Value } from '~/modules/value';
import { DeletableChipButton } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { DebugTriples } from '../debug/debug-triples';
import { EntityAutocompleteDialog } from '../entity/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '../entity/autocomplete/entity-text-autocomplete';
import { useEditEvents } from '../entity/edit-events';
import { TableStringField } from '../entity/editable-fields';

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
  triples,
  create,
  update,
  remove,
}: Props) {
  const { columnValueType, columnName } = useEntityTable();
  const send = useEditEvents({
    context: {
      entityId: cell.entityId,
      spaceId: space,
      entityName: Entity.name(triples) ?? '',
    },
    api: {
      create,
      update,
      remove,
    },
  });

  const entityName = Entity.name(triples) || '';
  const attributeId = cell.columnId;

  const entityValueTriples = triples.filter(t => t.value.type === 'entity');

  const valueType = columnValueType(cell.columnId);
  const cellColumnName = columnName(cell.columnId);

  const isNameCell = cell.columnId === 'name';
  const firstTriple = triples[0];
  const isRelationValueType = valueType === SYSTEM_IDS.RELATION;
  const isTextValueType = valueType === SYSTEM_IDS.TEXT;
  const isEmptyCell = triples.length === 0;

  const isEmptyRelation = isRelationValueType && isEmptyCell;
  const isEmptyText = isTextValueType && isEmptyCell;
  const isPopulatedRelation = isRelationValueType && !isEmptyCell;

  const removeEntityTriple = (triple: Triple) => {
    send({
      type: 'REMOVE_ENTITY',
      payload: {
        triple,
      },
    });
  };

  const createEntityTripleWithValue = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    send({
      type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE',
      payload: {
        attributeId,
        attributeName: cellColumnName,
        entityId: linkedEntity.id,
        entityName: linkedEntity.name || '',
      },
    });
  };

  const createStringTripleWithValue = (value: string) => {
    send({
      type: 'CREATE_STRING_TRIPLE_WITH_VALUE',
      payload: {
        attributeId,
        attributeName: cellColumnName,
        value,
      },
    });
  };

  const updateStringTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPDATE_VALUE',
      payload: {
        triple,
        value,
      },
    });
  };

  if (isNameCell) {
    return (
      <TableStringField
        placeholder="Entity name..."
        value={entityName}
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: firstTriple, name: e.target.value } })}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isPopulatedRelation && (
        <>
          {triples.map(triple => (
            <div key={`entity-${triple.value.id}`}>
              <DeletableChipButton
                href={NavUtils.toEntity(space, triple.value.id)}
                onClick={() => removeEntityTriple(triple)}
              >
                <a>{Value.nameOfEntityValue(triple)}</a>
              </DeletableChipButton>
            </div>
          ))}

          <EntityAutocompleteDialog
            spaceId={space}
            onDone={entity => createEntityTripleWithValue(attributeId, entity)}
            entityValueIds={entityValueTriples.map(t => t.value.id)}
          />
        </>
      )}

      {isEmptyRelation && (
        <EntityTextAutocomplete
          spaceId={space}
          placeholder="Add value..."
          onDone={result => createEntityTripleWithValue(attributeId, result)}
          itemIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.id)}
        />
      )}

      {isTextValueType && (
        <TableStringField
          placeholder="Add value..."
          onBlur={e =>
            isEmptyText
              ? createStringTripleWithValue(e.target.value)
              : updateStringTripleValue(firstTriple, e.target.value)
          }
          value={Value.nameOfStringValue(firstTriple) || ''}
        />
      )}

      <DebugTriples triples={triples} className="absolute right-0" />
    </div>
  );
});
