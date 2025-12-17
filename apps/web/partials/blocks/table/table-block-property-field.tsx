import { IdUtils, SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import { useState } from 'react';

import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Property } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import { onChangeEntryFn } from './change-entry';

export function TableBlockPropertyField(props: {
  spaceId: string;
  entityId: string;
  property: Property;
  onChangeEntry: onChangeEntryFn;
  source: Source;
  disableLink?: boolean;
}) {
  const { spaceId, entityId, property, source, disableLink = false } = props;
  const isEditing = useUserIsEditing(props.spaceId);
  const isRelation = property.dataType === 'RELATION';

  if (isEditing && source.type !== 'RELATIONS') {
    if (isRelation) {
      return (
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <EditableRelationsGroup entityId={entityId} spaceId={spaceId} property={property} disableLink={disableLink} />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <div className="flex w-full flex-wrap gap-2">
            <EditableValueGroup entityId={entityId} property={property} isEditing={isEditing} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-2">
      <RenderedProperty entityId={entityId} property={property} spaceId={spaceId} disableLink={disableLink} />
    </div>
  );
}

type PropertyProps = {
  entityId: string;
  property: Property;
  spaceId: string;
  className?: string;
  disableLink?: boolean;
};

const RenderedProperty = ({ entityId, property, spaceId, disableLink = false }: PropertyProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const isRelation = property.dataType === 'RELATION';

  if (property.renderableType === 'IMAGE') {
    // We don't support rendering images in list or gallery views except the main image
    return null;
  }

  return (
    <div
      className={cx('relative inline-block', isRelation ? 'mt-2' : 'mt-1')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute right-0 top-0 -translate-y-full pb-1">
        <div
          className={cx(
            'rounded-sm bg-black p-1 text-footnoteMedium text-white duration-300 ease-in-out',
            isHovered ? 'opacity-100 delay-700' : 'opacity-0'
          )}
        >
          {property.name}
        </div>
      </div>
      {isRelation ? (
        <EditableRelationsGroup entityId={entityId} spaceId={spaceId} property={property} disableLink={disableLink} />
      ) : (
        <EditableValueGroup entityId={entityId} property={property} isEditing={false} />
      )}
    </div>
  );
};

type EditableRelationsGroupProps = {
  spaceId: string;
  entityId: string;
  property: Property;
  disableLink?: boolean;
};

function EditableRelationsGroup({ entityId, spaceId, property, disableLink = false }: EditableRelationsGroupProps) {
  const { storage } = useMutate();

  const typeOfId = property.id;
  const typeOfName = property.name;
  const filterSearchByTypes = property?.relationValueTypes ? property?.relationValueTypes : [];
  const firstRelationValueType = property?.relationValueTypes?.[0];

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === typeOfId,
  });

  const isEmpty = relations.length === 0;

  if (isEmpty) {
    return (
      <div data-testid="select-entity" className="w-full">
        <SelectEntity
          spaceId={spaceId}
          relationValueTypes={filterSearchByTypes}
          onCreateEntity={result => {
            if (firstRelationValueType) {
              storage.relations.set({
                id: IdUtils.generate(),
                entityId: IdUtils.generate(),
                spaceId,
                renderableType: 'RELATION',
                verified: result.verified,
                toSpaceId: result.space,
                type: {
                  id: SystemIds.TYPES_PROPERTY,
                  name: 'Types',
                },
                fromEntity: {
                  id: result.id,
                  name: result.name,
                },
                toEntity: {
                  id: firstRelationValueType.id,
                  name: firstRelationValueType.name,
                  value: firstRelationValueType.id,
                },
              });
            }
          }}
          onDone={result => {
            storage.relations.set({
              id: IdUtils.generate(),
              // @TODO(migration): Reuse entity?
              entityId: IdUtils.generate(),
              spaceId,
              renderableType: 'RELATION',
              toSpaceId: result.space,
              type: {
                id: property.id,
                name: property.name,
              },
              fromEntity: {
                id: entityId,
                name: null,
              },
              toEntity: {
                id: result.id,
                name: result.name,
                value: result.id,
              },
            });
          }}
          variant="tableCell"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      {relations.map(r => {
        const relationId = r.id;
        const relationName = r.toEntity.name;
        const relationValue = r.toEntity.value;

        if (property.renderableTypeStrict === 'IMAGE') {
          return (
            <ImageZoom
              variant="table-cell"
              key={`image-${relationId}-${relationValue}`}
              imageSrc={relationValue ?? ''}
            />
          );
        }

        return (
          <div key={`relation-${relationId}-${relationValue}`} className="mt-2">
            <LinkableRelationChip
              isEditing
              onDelete={() => {
                storage.relations.delete(r);
              }}
              onDone={result => {
                storage.relations.update(r, draft => {
                  draft.toSpaceId = result.space;
                  draft.verified = result.verified;
                });
              }}
              currentSpaceId={spaceId}
              entityId={relationValue}
              relationId={relationId}
              relationEntityId={r.entityId}
              spaceId={r.toSpaceId}
              verified={r.verified}
              small
              disableLink={disableLink}
            >
              {relationName ?? relationValue}
            </LinkableRelationChip>
          </div>
        );
      })}
      {!isEmpty && (
        <div className="mt-2">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            relationValueTypes={filterSearchByTypes}
            onCreateEntity={result => {
              if (firstRelationValueType) {
                storage.relations.set({
                  id: IdUtils.generate(),
                  // @TODO(migration): Reuse entity?
                  entityId: IdUtils.generate(),
                  spaceId,
                  renderableType: 'RELATION',
                  toSpaceId: result.space,
                  type: {
                    id: SystemIds.TYPES_PROPERTY,
                    name: 'Types',
                  },
                  fromEntity: {
                    id: result.id,
                    name: result.name,
                  },
                  toEntity: {
                    id: firstRelationValueType.id,
                    name: firstRelationValueType.name,
                    value: firstRelationValueType.id,
                  },
                });
              }
            }}
            onDone={result => {
              storage.relations.set({
                id: IdUtils.generate(),
                // @TODO(migration): Reuse entity?
                entityId: IdUtils.generate(),
                spaceId,
                renderableType: 'RELATION',
                toSpaceId: result.space,
                type: {
                  id: typeOfId,
                  name: typeOfName,
                },
                fromEntity: {
                  id: entityId,
                  name: null,
                },
                toEntity: {
                  id: result.id,
                  name: result.name,
                  value: result.id,
                },
              });
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

type EditableValueGroupProps = {
  entityId: string;
  property: Property;
  isEditing: boolean;
};

function EditableValueGroup({ entityId, property, isEditing }: EditableValueGroupProps) {
  const rawValue = useValue({
    selector: v => v.entity.id === entityId && v.property.id === property.id,
  });

  const renderableType = property.renderableType ?? property.dataType;
  const value = rawValue?.value ?? '';

  switch (renderableType) {
    case 'NUMBER':
      return (
        <NumberField
          variant="tableCell"
          value={value}
          format={property.format || undefined}
          unitId={rawValue?.options?.unit || property.unit || undefined}
          isEditing={isEditing}
          onChange={value => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'NUMBER',
            //           value: value,
            //           options: {
            //             // format: renderable.options?.format,
            //             unit: rawValue.options?.unit,
            //           },
            //         },
            //       },
            //     },
            //   }
            // );
          }}
        />
      );
    case 'TEXT':
      return (
        <TableStringField
          variant="tableCell"
          placeholder="Add value..."
          value={value}
          onChange={value => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'TEXT',
            //           value: value,
            //         },
            //       },
            //     },
            //   }
            // );
          }}
        />
      );
    case 'CHECKBOX': {
      const checked = getChecked(value);
      return (
        <Checkbox
          checked={checked}
          onChange={() => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'CHECKBOX',
            //           value: !checked ? '1' : '0',
            //         },
            //       },
            //     },
            //   }
            // );
          }}
        />
      );
    }
    case 'TIME':
      return (
        <DateField
          isEditing={true}
          value={value}
          propertyId={property.id}
          onBlur={value => {
            // onChangeEntry(
            //   {
            //     entityId: renderable.entityId,
            //     entityName: renderable.entityName,
            //     spaceId: renderable.spaceId,
            //   },
            //   {
            //     type: 'EVENT',
            //     data: {
            //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
            //       payload: {
            //         renderable,
            //         value: {
            //           type: 'TIME',
            //           value: value.value,
            //           options: {
            //             format: value.format,
            //           },
            //         },
            //       },
            //     },
            //   }
            // );
          }}
        />
      );
    // case 'URL':
    //   return (
    //     <WebUrlField
    //       key={property.id}
    //       variant="tableCell"
    //       placeholder="Add a URI"
    //       isEditing={true}
    //       spaceId={spaceId}
    //       value={value}
    //       onBlur={e => {
    //         onChangeEntry(
    //           {
    //             entityId: renderable.entityId,
    //             entityName: renderable.entityName,
    //             spaceId: renderable.spaceId,
    //           },
    //           {
    //             type: 'EVENT',
    //             data: {
    //               type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
    //               payload: {
    //                 renderable,
    //                 value: {
    //                   type: 'URL',
    //                   value: e.currentTarget.value,
    //                 },
    //               },
    //             },
    //           }
    //         );
    //       }}
    //     />
    //   );
  }
}
