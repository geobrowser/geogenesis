'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityTextValue } from '~/core/sync/use-entity-text-value';

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

/**
 * An entity's description, under its name, read and written in place.
 *
 * Not rendered on a person's profile in either mode. There the description belongs to the
 * About card, which both shows it and edits it — see `AboutSection`. This component used to
 * take a `hideWhenReading` flag for that, which left the field under the name in edit mode and
 * the text in the card, so the same sentence had two homes depending on the toggle.
 */
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
  const { value, setValue } = useEntityTextValue({
    entityId,
    spaceId,
    propertyId: SystemIds.DESCRIPTION_PROPERTY,
    propertyName: 'Description',
  });

  const description = value ?? fallbackDescription ?? '';

  if (isEditing) {
    return (
      <div className="-mt-3 mb-5 text-text">
        <PageStringField
          variant="body"
          placeholder="Add a description..."
          aria-label="Description"
          value={description}
          onChange={setValue}
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
