import { memo } from 'react';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Entity } from '~/modules/entity';
import { NavUtils } from '~/modules/utils';
import { Value } from '~/modules/value';
import { DeletableChipButton } from '../../design-system/chip';
import { Cell, Triple } from '../../types';
import { EntityAutocompleteDialog } from '../entity/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '../entity/autocomplete/entity-text-autocomplete';
import { useEditEvents } from '../entity/edit-events';
import { TableImageField, TableStringField } from '../editable-fields/editable-fields';
import { DateField } from '../editable-fields/date-field';

interface Props {
  cell: Cell;
  space: string;
  triples: Triple[];
  create: (triple: Triple) => void;
  update: (triple: Triple, oldTriple: Triple) => void;
  remove: (triple: Triple) => void;
  valueType: string;
  columnName: string;
  columnRelationTypes?: { typeId: string; typeName: string | null }[];
}

export const EditableEntityTableCell = memo(function EditableEntityTableCell({
  cell,
  space,
  triples,
  create,
  update,
  remove,
  columnName,
  valueType,
  columnRelationTypes,
}: Props) {
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

  const isNameCell = cell.columnId === SYSTEM_IDS.NAME;
  const firstTriple = triples[0];
  const isRelationValueType = valueType === SYSTEM_IDS.RELATION;
  const isTextValueType = valueType === SYSTEM_IDS.TEXT;
  const isImageValueType = valueType === SYSTEM_IDS.IMAGE;
  const isDateValueType = valueType === SYSTEM_IDS.DATE;
  const isEmptyCell = triples.length === 0;

  const isEmptyRelation = isRelationValueType && isEmptyCell;
  const isPopulatedRelation = isRelationValueType && !isEmptyCell;

  // @TODO(baiirun): move encoding an empty string array to undefined to queries.ts
  // Pass the ids only if they are defined and not empty.
  const typesToFilter = columnRelationTypes
    ? columnRelationTypes.length > 0
      ? columnRelationTypes
      : undefined
    : undefined;

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
        attributeName: columnName,
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
        attributeName: columnName,
        value,
      },
    });
  };

  const createDateTripleWithValue = (value: string) => {
    send({
      type: 'CREATE_DATE_TRIPLE_WITH_VALUE',
      payload: {
        attributeId,
        attributeName: columnName,
        value,
      },
    });
  };

  const uploadImage = (triple: Triple, imageSrc: string) => {
    send({
      type: 'UPLOAD_IMAGE',
      payload: {
        triple,
        imageSrc,
      },
    });
  };

  const createImageWithValue = (imageSrc: string) => {
    send({
      type: 'CREATE_IMAGE_TRIPLE_WITH_VALUE',
      payload: {
        imageSrc,
        attributeId,
        attributeName: columnName,
      },
    });
  };

  const removeImage = (triple: Triple) => {
    send({
      type: 'REMOVE_IMAGE',
      payload: {
        triple,
      },
    });
  };

  const updateStringTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPDATE_STRING_VALUE',
      payload: {
        triple,
        value,
      },
    });
  };

  const updateDateTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPDATE_DATE_VALUE',
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
    <div className="flex w-full flex-wrap gap-2">
      {isPopulatedRelation && (
        <>
          {triples.map(triple => (
            <div key={`entity-${triple.value.id}`}>
              <DeletableChipButton
                href={NavUtils.toEntity(triple.space, triple.value.id)}
                onClick={() => removeEntityTriple(triple)}
              >
                <a>{Value.nameOfEntityValue(triple)}</a>
              </DeletableChipButton>
            </div>
          ))}

          <EntityAutocompleteDialog
            onDone={entity => createEntityTripleWithValue(attributeId, entity)}
            entityValueIds={entityValueTriples
              .filter(triple => triple.attributeId === attributeId)
              .map(triple => triple.value.id)}
            allowedTypes={typesToFilter}
            spaceId={space}
          />
        </>
      )}

      {isEmptyRelation && (
        <EntityTextAutocomplete
          spaceId={space}
          placeholder="Add value..."
          onDone={result => createEntityTripleWithValue(attributeId, result)}
          itemIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.id)}
          allowedTypes={typesToFilter}
        />
      )}

      {isTextValueType && (
        <TableStringField
          placeholder="Add value..."
          onBlur={e =>
            isEmptyCell
              ? createStringTripleWithValue(e.target.value)
              : updateStringTripleValue(firstTriple, e.target.value)
          }
          value={Value.stringValue(firstTriple) ?? ''}
        />
      )}

      {isImageValueType && (
        <TableImageField
          imageSrc={Value.imageValue(firstTriple) || ''}
          variant="avatar"
          onImageChange={imageSrc => {
            isEmptyCell ? createImageWithValue(imageSrc) : uploadImage(firstTriple, imageSrc);
          }}
          onImageRemove={() => {
            removeImage(firstTriple);
          }}
        />
      )}

      {isDateValueType && (
        <DateField
          isEditing={true}
          onBlur={date => (isEmptyCell ? createDateTripleWithValue(date) : updateDateTripleValue(firstTriple, date))}
          value={Value.dateValue(firstTriple) ?? ''}
          variant="tableCell"
        />
      )}
    </div>
  );
});
