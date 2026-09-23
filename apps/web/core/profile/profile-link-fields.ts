import type { SchemaPropertyGroup } from '~/core/database/entities';
import type { Property } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { LINKS_GROUP_NAME, linkFormat } from './profile-links';

/**
 * One editable row in the Links card (GEO-2859).
 *
 * `value` is what the profile currently holds, empty for a property nobody has
 * filled in — the editor shows set and unset alike, because the point of opening
 * it is usually to add the one that is missing.
 */
export type ProfileLinkField = {
  propertyId: string;
  /** The property's own name — "X", "Website" — or the format's label where it has one. */
  label: string;
  value: string;
  /** How a filled-in value becomes a URL, where the format is known. */
  format?: (handle: string) => string;
};

/**
 * The fields the Links card offers, taken from the type rather than a list here.
 *
 * **From the property group, deliberately.** The rail's display formats and the
 * Person type's group had already drifted apart — the formats named GitHub,
 * which the group does not carry, and the group names Website, which the formats
 * could not render. A hardcoded editor would be a third list to drift from the
 * other two, and the thing being edited is defined by the type: whatever the
 * Person type groups under "Links" is what a person can put there.
 *
 * Matched on the group's *name*. The graph holds more than one entity called
 * "Links", and a space can carry its own — so the id of any single one of them
 * is the wrong key, while the name is what the type page shows and what this
 * card is named after.
 */
export function profileLinkFields({
  propertyGroups,
  schema,
  values,
}: {
  propertyGroups: readonly SchemaPropertyGroup[];
  schema: readonly Property[];
  values: readonly { property: { id: string }; value: string }[];
}): ProfileLinkField[] {
  const group = propertyGroups.find(
    candidate => candidate.name?.trim().toLowerCase() === LINKS_GROUP_NAME.toLowerCase()
  );
  if (!group) return [];

  const namesById = new Map(schema.map(property => [normId(property.id), property.name]));
  const valuesById = new Map(values.map(value => [normId(value.property.id), value.value.trim()]));

  const seen = new Set<string>();
  const fields: ProfileLinkField[] = [];

  for (const propertyId of group.propertyIds) {
    const key = normId(propertyId);
    // A group can list the same property twice once its relations exist in more
    // than one space, which would otherwise draw two inputs writing to one value.
    if (seen.has(key)) continue;
    seen.add(key);

    const format = linkFormat(key);

    fields.push({
      propertyId: key,
      label: format?.label ?? namesById.get(key) ?? 'Link',
      value: valuesById.get(key) ?? '',
      format: format?.url,
    });
  }

  return fields;
}

/**
 * Whether anything in this edit differs from what the profile already holds.
 *
 * Compared trimmed, because trailing whitespace is not an edit anyone means to
 * make and publishing one costs the same minute as a real change.
 */
export function changedLinkFields(
  fields: readonly ProfileLinkField[],
  draft: Readonly<Record<string, string>>
): ProfileLinkField[] {
  return fields.filter(field => (draft[field.propertyId] ?? field.value).trim() !== field.value.trim());
}
