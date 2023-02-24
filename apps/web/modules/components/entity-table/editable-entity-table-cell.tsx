import { memo } from 'react';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { Entity, useEntityTable } from '~/modules/entity';
import { groupBy, NavUtils } from '~/modules/utils';
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
  triples: serverTriples,
  create,
  update,
  remove,
}: Props) {
  const { columnValueType, columnName } = useEntityTable();
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

  const entityValueTriples = cellTriples.filter(t => t.value.type === 'entity');

  const valueType = columnValueType(cell.columnId);
  const cellColumnName = columnName(cell.columnId);

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
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { triple: cellTriples[0], name: e.target.value } })}
      />
    );
  }

  const firstTriple = cellTriples[0];
  const isRelationValueType = valueType === SYSTEM_IDS.RELATION;
  const isTextValueType = valueType === SYSTEM_IDS.TEXT;
  const isEmptyCell = cellTriples.length === 0;

  const isEmptyRelation = isRelationValueType && isEmptyCell;
  const isEmptyText = isTextValueType && isEmptyCell;
  const isPopulatedRelation = isRelationValueType && !isEmptyCell;

  return (
    <div className="flex flex-wrap gap-2">
      {isPopulatedRelation && (
        <>
          {cellTriples.map(triple => (
            <div key={`entity-${triple.value.id}`}>
              <DeletableChipButton
                href={NavUtils.toEntity(space, triple.value.id)}
                onClick={() => removeOrResetEntityTriple(triple)}
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

      <div className="absolute right-0">
        <DebugTriples triples={cellTriples} />
      </div>
    </div>
  );
});
