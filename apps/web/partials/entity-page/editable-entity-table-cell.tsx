import { SYSTEM_IDS } from '@geogenesis/sdk';

import { memo } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Cell, EntitySearchResult, Triple, TripleWithCollectionValue } from '~/core/types';
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
  upsert: ReturnType<typeof useActionsStore>['upsert'];
  upsertMany: ReturnType<typeof useActionsStore>['upsertMany'];
  remove: ReturnType<typeof useActionsStore>['remove'];
  valueType: string;
  columnName: string;
  columnRelationTypes?: { typeId: string; typeName: string | null }[];
}

export const EditableEntityTableCell = memo(function EditableEntityTableCell({
  cell,
  space,
  triples,
  upsert,
  upsertMany,
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
      upsert,
      upsertMany,
      remove,
    },
  });

  const entityName = Entity.name(triples) || '';
  const attributeId = cell.columnId;

  const entityValueTriples = triples.filter(t => t.value.type === 'ENTITY');

  // @TODO(migration): We only have one triple at a time usually. Although there
  // might be multiple triples if we don't filter by the space.
  const firstTriple = triples[0];
  const isNameCell = cell.columnId === SYSTEM_IDS.NAME;
  const isCollectionValueTypeColumn = valueType === SYSTEM_IDS.COLLECTION_VALUE_TYPE;
  const isRelationValueTypeColumn = valueType === SYSTEM_IDS.RELATION;
  const isTextValueTypeColumn = valueType === SYSTEM_IDS.TEXT;
  const isImageValueTypeColumn = valueType === SYSTEM_IDS.IMAGE;
  const isDateValueTypeColumn = valueType === SYSTEM_IDS.DATE;
  const isUrlValueTypeColumn = valueType === SYSTEM_IDS.WEB_URL;
  const isEmptyCell = triples.length === 0;

  const isEmptyRelation = isRelationValueTypeColumn && isEmptyCell;
  const isPopulatedRelation = isRelationValueTypeColumn && !isEmptyCell;
  const isPopulatedCollection = isCollectionValueTypeColumn && !isEmptyCell;

  const typesToFilter = columnRelationTypes
    ? columnRelationTypes.length > 0
      ? columnRelationTypes
      : undefined
    : undefined;

  const deleteEntityTriple = (triple: Triple) => {
    send({
      type: 'DELETE_ENTITY',
      payload: {
        triple,
      },
    });
  };

  const createCollectionItem = (collectionId: string, entity: EntitySearchResult, collectionTriple: Triple) => {
    send({
      type: 'CREATE_COLLECTION_ITEM',
      payload: {
        entity,
        collectionId,
        collectionTriple: collectionTriple as TripleWithCollectionValue,
      },
    });
  };

  const deleteCollectionItem = (collectionItemId: string, collectionTriple: Triple) => {
    send({
      type: 'DELETE_COLLECTION_ITEM',
      payload: {
        collectionItemId,
        collectionTriple: collectionTriple as TripleWithCollectionValue,
      },
    });
  };

  const createEntityTripleWithValue = (attributeId: string, linkedEntity: { id: string; name: string | null }) => {
    send({
      type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER',
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
      type: 'CREATE_TEXT_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId,
        attributeName: columnName,
        value,
      },
    });
  };

  const createUrlTripleWithValue = (value: string) => {
    send({
      type: 'CREATE_URL_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        attributeId,
        attributeName: columnName,
        value,
      },
    });
  };

  const createDateTripleWithValue = (value: string) => {
    send({
      type: 'CREATE_TIME_TRIPLE_FROM_PLACEHOLDER',
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
      type: 'CREATE_IMAGE_TRIPLE_FROM_PLACEHOLDER',
      payload: {
        imageSrc,
        attributeId,
        attributeName: columnName,
      },
    });
  };

  const deleteImage = (triple: Triple) => {
    send({
      type: 'DELETE_IMAGE_TRIPLE',
      payload: {
        triple,
      },
    });
  };

  const updateStringTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'TEXT',
          value,
        },
      },
    });
  };

  const updateUrlTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'URL',
          value,
        },
      },
    });
  };

  const updateTimeTripleValue = (triple: Triple, value: string) => {
    send({
      type: 'UPSERT_TRIPLE_VALUE',
      payload: {
        triple,
        value: {
          type: 'TIME',
          value,
        },
      },
    });
  };

  if (isNameCell) {
    return (
      <TableStringField
        placeholder="Entity name..."
        value={entityName}
        onBlur={e => send({ type: 'EDIT_ENTITY_NAME', payload: { name: e.target.value } })}
      />
    );
  }

  return (
    <div className="flex w-full flex-wrap gap-2">
      {/* @TODO: Collections */}
      {isPopulatedCollection && triples[0].value.type === 'COLLECTION' && (
        <>
          {triples[0].value.items.map(item => (
            <div key={`entity-${item.id}`}>
              <DeletableChipButton
                href={NavUtils.toEntity(triples[0].space, item.entity.id)}
                onClick={() => deleteCollectionItem(item.id, triples[0])}
              >
                {item.value.value ?? item.entity.id}
              </DeletableChipButton>
            </div>
          ))}

          <EntityAutocompleteDialog
            onDone={entity => createCollectionItem(triples[0].entityId, entity, triples[0])}
            entityValueIds={entityValueTriples
              .filter(triple => triple.attributeId === attributeId)
              .map(triple => triple.value.value)}
            allowedTypes={typesToFilter}
            spaceId={space}
            attributeId={attributeId}
          />
        </>
      )}
      {isPopulatedRelation && (
        <>
          {triples.map(triple => (
            <div key={`entity-${triple.value}`}>
              <DeletableChipButton
                href={NavUtils.toEntity(triple.space, triple.value.value)}
                onClick={() => deleteEntityTriple(triple)}
              >
                {Value.nameOfEntityValue(triple)}
              </DeletableChipButton>
            </div>
          ))}

          <EntityAutocompleteDialog
            onDone={entity => createEntityTripleWithValue(attributeId, entity)}
            entityValueIds={entityValueTriples
              .filter(triple => triple.attributeId === attributeId)
              .map(triple => triple.value.value)}
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
          alreadySelectedIds={entityValueTriples.filter(t => t.attributeId === attributeId).map(t => t.value.value)}
          allowedTypes={typesToFilter}
          attributeId={attributeId}
          containerClassName="!z-20"
        />
      )}

      {isTextValueTypeColumn && (
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

      {isImageValueTypeColumn && (
        <TableImageField
          imageSrc={Value.imageValue(firstTriple) || ''}
          variant="table-cell"
          onImageChange={imageSrc => {
            isEmptyCell ? createImageWithValue(imageSrc) : uploadImage(firstTriple, imageSrc);
          }}
          onImageRemove={() => {
            deleteImage(firstTriple);
          }}
        />
      )}

      {isDateValueTypeColumn && (
        <DateField
          isEditing={true}
          onBlur={date => (isEmptyCell ? createDateTripleWithValue(date) : updateTimeTripleValue(firstTriple, date))}
          value={Value.timeValue(firstTriple) ?? ''}
          variant="tableCell"
        />
      )}

      {isUrlValueTypeColumn && (
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
