import { SYSTEM_IDS } from '@geogenesis/ids';

import { memo } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { Cell, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { EntityAutocompleteDialog } from '~/design-system/autocomplete/entity-autocomplete';
import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { DeletableChipButton } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { TableImageField, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';

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
  const isUrlValueType = valueType === SYSTEM_IDS.WEB_URL;
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

  const createUrlTripleWithValue = (value: string) => {
    send({
      type: 'CREATE_URL_TRIPLE_WITH_VALUE',
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

  const updateUrlTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPDATE_URL_VALUE',
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
                {Value.nameOfEntityValue(triple)}
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
            attributeId={attributeId}
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
          attributeId={attributeId}
          containerClassName="!z-20"
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
          variant="table-cell"
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

      {isUrlValueType && (
        <WebUrlField
          isEditing={true}
          onBlur={e =>
            isEmptyCell
              ? createUrlTripleWithValue(e.currentTarget.value)
              : updateUrlTripleValue(firstTriple, e.currentTarget.value)
          }
          value={Value.urlValue(firstTriple) ?? ''}
          placeholder="Add value..."
          variant="tableCell"
        />
      )}
    </div>
  );
});
