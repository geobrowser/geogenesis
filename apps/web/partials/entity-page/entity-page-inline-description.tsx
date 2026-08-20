'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

import { ClampedText } from '~/design-system/clamped-text';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';

const MAX_LINES = 3;

export function EntityPageInlineDescription({
  entityId,
  spaceId,
  truncate = true,
  fallbackDescription,
}: {
  entityId: string;
  spaceId: string;
  truncate?: boolean;
  fallbackDescription?: string | null;
}) {
  const isEditing = useUserIsEditing(spaceId);
  const { storage } = useMutate();

  const rawValue = useValue({
    selector: v =>
      v.entity.id === entityId && v.spaceId === spaceId && v.property.id === SystemIds.DESCRIPTION_PROPERTY,
  });

  const description = rawValue?.value ?? fallbackDescription ?? '';

  if (isEditing) {
    const onChange = (next: string) => {
      if (next === '' && rawValue) {
        storage.values.delete(rawValue);
        return;
      }

      if (!rawValue) {
        if (next === '') return;
        storage.values.set({
          spaceId,
          entity: { id: entityId, name: null },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          value: next,
        });
        return;
      }

      storage.values.update(rawValue, draft => {
        draft.value = next;
        draft.property.dataType = 'TEXT';
      });
    };

    return (
      <div className="-mt-3 mb-5 text-text">
        <PageStringField
          variant="body"
          placeholder="Add a description..."
          aria-label="Description"
          value={description}
          onChange={onChange}
        />
      </div>
    );
  }

  if (!description) {
    return null;
  }

  if (!truncate) {
    return (
      <div className="-mt-3 mb-5">
        <p className="text-body wrap-break-word text-text">{description}</p>
      </div>
    );
  }

  return (
    <div className="-mt-3 mb-5">
      <ClampedText text={description} maxLines={MAX_LINES} variant="body" textClassName="wrap-break-word text-text" />
    </div>
  );
}
