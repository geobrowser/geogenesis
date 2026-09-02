'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

import { ClampedText } from '~/design-system/clamped-text';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';

/**
 * How many lines a description shows before it collapses behind More.
 *
 * Exported because the custom claim page clamps its own description with the same primitive
 * rather than through this component (GEO-2772) — it has the entity in hand, renders no edit
 * field, and carries its own colour and spacing. Sharing the number is what keeps the two
 * surfaces spending the same amount of the page on a description before hiding the rest. Where
 * each one breaks still depends on its own width, since that is where the wrapping happens.
 */
export const ENTITY_DESCRIPTION_MAX_LINES = 3;

export function EntityPageInlineDescription({
  entityId,
  spaceId,
  fallbackDescription,
}: {
  entityId: string;
  spaceId: string;
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

  return (
    <div className="-mt-3 mb-5">
      <ClampedText
        text={description}
        maxLines={ENTITY_DESCRIPTION_MAX_LINES}
        variant="body"
        textClassName="wrap-break-word text-text"
      />
    </div>
  );
}
