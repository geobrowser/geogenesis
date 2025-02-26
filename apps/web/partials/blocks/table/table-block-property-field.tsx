import { editEvent, useEditEvents } from '~/core/events/edit-events';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { RelationRenderableProperty, RenderableProperty } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

export function TableBlockPropertyField(props: {
  renderables: RenderableProperty[];
  spaceId: string;
  entityId: string;
}) {
  const { renderables, spaceId, entityId } = props;
  const isEditing = useUserIsEditing(props.spaceId);

  if (isEditing) {
    const firstRenderable = renderables[0] as RenderableProperty | undefined;
    const isRelation = firstRenderable?.type === 'RELATION' || firstRenderable?.type === 'IMAGE';

    if (isRelation) {
      return (
        <div>
          <div className="text-metadata text-grey-04">{firstRenderable.attributeName}</div>
          <RelationsGroup
            isPlaceholderEntry={true}
            entityId={entityId}
            spaceId={spaceId}
            renderables={renderables as RelationRenderableProperty[]}
            entityName={null}
          />
        </div>
      );
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.renderables.map(renderable => {
        switch (renderable.type) {
          case 'TEXT':
          case 'NUMBER':
            return (
              <Text key={`string-${renderable.attributeId}-${renderable.value}`} as="p">
                {renderable.value}
              </Text>
            );
          case 'CHECKBOX': {
            const checked = getChecked(renderable.value);
            return <Checkbox key={`checkbox-${renderable.attributeId}-${renderable.value}`} checked={checked} />;
          }
          case 'TIME': {
            const time = new Date(renderable.value).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });

            return (
              <Text variant="breadcrumb" color="text" key={`time-${renderable.attributeId}-${renderable.value}`}>
                {time}
              </Text>
            );
          }
          case 'URL': {
            return (
              <WebUrlField
                key={`uri-${renderable.attributeId}-${renderable.value}`}
                isEditing={false}
                spaceId={props.spaceId}
                value={renderable.value}
              />
            );
          }
          case 'IMAGE':
            // We don't support rendering images in list or gallery views except the main image
            return null;
          case 'RELATION':
            return (
              <LinkableRelationChip
                isEditing={false}
                entityHref={NavUtils.toEntity(renderable.spaceId, renderable.value)}
                relationHref={NavUtils.toEntity(renderable.spaceId, renderable.relationId)}
              >
                {renderable.valueName ?? renderable.value}
              </LinkableRelationChip>
            );
        }
      })}
    </div>
  );
}

type RelationsGroupProps = {
  spaceId: string;
  entityId: string;
  entityName: string | null;
  renderables: RelationRenderableProperty[];
  isPlaceholderEntry: boolean;
};

function RelationsGroup({ renderables, entityId, spaceId, entityName }: RelationsGroupProps) {
  // @TODO: What should these ids actually be? They can be from different entities and
  // different spaces actually.
  //
  // @TODO: Makesure we write to the right entity and space.
  const send = useEditEvents({
    context: {
      entityId: entityId,
      spaceId,
      entityName: entityName,
    },
  });

  const firstRenderable = renderables[0];
  const hasPlaceholders = renderables.some(r => r.placeholder === true);
  const typeOfId = firstRenderable.attributeId;
  const typeOfName = firstRenderable.attributeName;

  const filterSearchByTypes: string[] = [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {renderables.map(r => {
        const relationId = r.relationId;
        const relationName = r.valueName;
        const renderableType = r.type;
        const relationValue = r.value;

        // The send API needs to be unique for each renderable as each renderable
        // can potentially belong to different entities in different spaces. By
        // default we try to use the renderable space. If the current user doesn't
        // have access to the renderable's space we should use the local one.
        const send = editEvent({
          context: {
            entityId: r.entityId,
            entityName: r.entityName,
            spaceId: r.spaceId,
          },
        });

        if (renderableType === 'IMAGE') {
          return (
            <ImageZoom
              variant="table-cell"
              key={`image-${relationId}-${relationValue}`}
              imageSrc={getImagePath(relationValue ?? '')}
            />
          );
        }

        if (r.placeholder === true) {
          return (
            <div key={`${r.entityId}-${r.attributeId}-${r.value}`} data-testid="select-entity" className="w-full">
              <SelectEntity
                spaceId={spaceId}
                allowedTypes={filterSearchByTypes}
                onDone={result => {
                  send({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: entityId,
                      fromEntityName: entityName,
                      toEntityId: result.id,
                      toEntityName: result.name,
                      typeOfId: r.attributeId,
                      typeOfName: r.attributeName,
                    },
                  });
                }}
                variant="fixed"
              />
            </div>
          );
        }

        return (
          <>
            <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  send({
                    type: 'DELETE_RELATION',
                    payload: {
                      relationId,
                      fromEntityId: entityId,
                    },
                  });
                }}
                entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                relationHref={NavUtils.toEntity(spaceId, relationId)}
              >
                {relationName ?? relationValue}
              </LinkableRelationChip>
            </div>
          </>
        );
      })}
      {!hasPlaceholders && (
        <div className="mt-1">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            allowedTypes={filterSearchByTypes}
            onDone={result => {
              send({
                type: 'UPSERT_RELATION',
                payload: {
                  fromEntityId: entityId,
                  fromEntityName: entityName,
                  toEntityId: result.id,
                  toEntityName: result.name,
                  typeOfId: typeOfId,
                  typeOfName: typeOfName,
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
