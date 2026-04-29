'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Text } from '~/design-system/text';

type EntityPageDescriptionProps = {
  entityId: string;
  spaceId: string;
};

export function EntityPageDescription({ entityId, spaceId }: EntityPageDescriptionProps) {
  const isEditing = useUserIsEditing(spaceId);
  const { storage } = useMutate();

  const descriptionValue = useValue({
    selector: v =>
      v.entity.id === entityId &&
      v.spaceId === spaceId &&
      v.property.id === SystemIds.DESCRIPTION_PROPERTY &&
      !v.isDeleted,
  });

  const description = descriptionValue?.value ?? '';

  const onDescriptionChange = (value: string) => {
    if (value.length === 0) {
      if (descriptionValue) {
        storage.values.delete(descriptionValue);
      }
      return;
    }

    if (!descriptionValue) {
      storage.values.set({
        id: ID.createValueId({
          entityId,
          propertyId: SystemIds.DESCRIPTION_PROPERTY,
          spaceId,
        }),
        spaceId,
        entity: {
          id: entityId,
          name: null,
        },
        property: {
          id: SystemIds.DESCRIPTION_PROPERTY,
          name: 'Description',
          dataType: 'TEXT',
        },
        value,
      });
      return;
    }

    storage.values.update(descriptionValue, draft => {
      draft.value = value;
      draft.property.dataType = 'TEXT';
    });
  };

  if (isEditing) {
    return (
      <div className="min-w-0 text-text">
        <PageStringField
          variant="body"
          placeholder="Add a description..."
          value={description}
          onChange={onDescriptionChange}
        />
      </div>
    );
  }

  if (description.trim().length === 0) {
    return null;
  }

  return (
    <Text as="p" variant="body" className="min-w-0 max-w-full break-words">
      {description}
    </Text>
  );
}
