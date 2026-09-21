'use client';

import * as React from 'react';

import { ID } from '~/core/id';
import type { ProfileLinkField } from '~/core/profile/profile-link-fields';

/**
 * The Links card's editing state (GEO-2859).
 *
 * Every property the type groups under "Links", set and unset alike — the reason
 * to open this is usually the one that is missing, so a card showing only what
 * is already filled in would hide the thing being looked for.
 *
 * Presentational: the card above owns the draft and the publish, the same way
 * the record sections leave their writing to `useEditProfile`. What lives here
 * is the shape of a row and what a blank one means.
 */
export function ProfileLinksEditor({
  fields,
  draft,
  onChange,
  isDisabled,
}: {
  fields: readonly ProfileLinkField[];
  draft: Readonly<Record<string, string>>;
  onChange: (propertyId: string, value: string) => void;
  isDisabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {fields.map(field => (
        <label key={field.propertyId} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-metadata text-grey-04">{field.label}</span>
          <input
            type="text"
            value={draft[field.propertyId] ?? field.value}
            onChange={event => onChange(field.propertyId, event.currentTarget.value)}
            disabled={isDisabled}
            // The handle rather than the address, matching what the card renders
            // and what the graph stores — the format adds the rest.
            placeholder={placeholderFor(field)}
            className="min-w-0 flex-1 rounded border border-grey-02 px-2 py-1 text-right text-metadata text-text placeholder:text-grey-03 focus:border-text focus:outline-none disabled:text-grey-04"
          />
        </label>
      ))}
    </div>
  );
}

/**
 * What an empty row suggests.
 *
 * Derived from the format so it cannot contradict it: a property the card knows
 * how to turn into a URL asks for the part it will add to, and one it does not
 * asks for nothing in particular rather than inventing a convention.
 */
export function placeholderFor(field: Pick<ProfileLinkField, 'label' | 'format'>): string {
  if (!field.format) return field.label;

  const shaped = field.format('handle');
  // "https://x.com/handle" reads better as a hint than "handle" alone, and it is
  // the only place the reader is told what the card will do with what they type.
  return shaped.replace(/^https?:\/\//i, '');
}

/**
 * The value rows an edit produces, for `useEditProfile.publish` to write.
 *
 * A cleared field is a deletion rather than an empty string: the rail hides a
 * link with no handle, so writing `''` would leave a row the reader cannot see
 * and the next edit has to explain. `publish` routes `isDeleted` to
 * `storage.values.delete`.
 *
 * Ids are derived, not minted — `createValueId` is a function of entity,
 * property and space — so editing the same link twice addresses one row rather
 * than stacking two.
 */
export function linkValueRows({
  fields,
  draft,
  entityId,
  entityName,
  spaceId,
}: {
  fields: readonly ProfileLinkField[];
  draft: Readonly<Record<string, string>>;
  entityId: string;
  entityName: string | null;
  spaceId: string;
}) {
  return fields.flatMap(field => {
    const next = (draft[field.propertyId] ?? field.value).trim();
    if (next === field.value.trim()) return [];

    return [
      {
        id: ID.createValueId({ entityId, propertyId: field.propertyId, spaceId }),
        entity: { id: entityId, name: entityName },
        property: {
          id: field.propertyId,
          name: field.label,
          dataType: 'TEXT' as const,
          renderableType: 'TEXT' as const,
        },
        spaceId,
        value: next,
        isDeleted: next === '',
      },
    ];
  });
}
