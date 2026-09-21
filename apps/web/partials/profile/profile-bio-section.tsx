'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useValue } from '~/core/sync/use-store';

import { ClampedText } from '~/design-system/clamped-text';

/**
 * The person's description, as a section of the profile rather than a line
 * under the name — titled and set the way Experience and Education are.
 *
 * Read-only. It is still edited in the header, which is where its edit field is;
 * the header shows it only while editing (`hideWhenReading`).
 */
export function ProfileBioSection({ spaceId, personEntityId }: { spaceId: string; personEntityId: string }) {
  const description = useValue({
    selector: v =>
      v.entity.id === personEntityId && v.spaceId === spaceId && v.property.id === SystemIds.DESCRIPTION_PROPERTY,
  })?.value;

  if (!description) return null;

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="text-mediumTitle text-text">About</h3>
      </header>
      <ClampedText text={description} maxLines={6} variant="metadata" textClassName="wrap-break-word text-text" />
    </section>
  );
}
