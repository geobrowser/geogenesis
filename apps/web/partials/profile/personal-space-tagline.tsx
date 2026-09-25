'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import {
  TAGLINE_MAX_LENGTH,
  TAGLINE_PROPERTY,
  normalizeTagline,
  taglineLengthHint,
} from '~/core/profile/profile-ontology';
import { useEntityTextValue } from '~/core/sync/use-entity-text-value';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';

/**
 * The line a person writes about themselves, directly under their name.
 *
 * Sits above the roles rather than below them because it is the claim they chose to make:
 * `ProfileHeadline` under it is derived from their Work and Education records, and reads as
 * the evidence for it. A profile with neither shows nothing here at all.
 *
 * Its own component because it renders into the header, which the space route assembles in the
 * layout while the side panel assembles its own — the same reason `PersonalSpaceHeadline` is
 * separate.
 */
export function PersonalSpaceTagline({
  spaceId,
  personEntityId,
  fallbackTagline,
}: {
  spaceId: string;
  personEntityId: string;
  /**
   * The tagline the server already read, shown until the store has the entity.
   *
   * Without it the line paints empty and then appears, pushing the roles and everything under
   * them down — the same reason the About card is handed a `serverDescription`.
   */
  fallbackTagline?: string | null;
}) {
  const isEditing = useUserIsEditing(spaceId);
  const { text: tagline, setValue } = useEntityTextValue({
    entityId: personEntityId,
    spaceId,
    propertyId: TAGLINE_PROPERTY,
    propertyName: 'Tagline',
    fallback: fallbackTagline,
  });

  if (isEditing) {
    return (
      <div className="text-text">
        <PageStringField
          variant="body"
          // The same words the modal's field asks for, so the two places a tagline is written
          // ask for the same thing. It rides in the placeholder rather than a hint line below,
          // because the header is wide enough to hold it on one line and a permanent second
          // line of chrome directly under someone's name is not — and it is only needed while
          // the field is empty, which is exactly as long as a placeholder lasts.
          placeholder="Your role, or what you’re working on now."
          aria-label="Tagline"
          maxLength={TAGLINE_MAX_LENGTH}
          value={tagline}
          // Cut here as well as on the input's own `maxLength`, which a paste can exceed in
          // some browsers and which does nothing at all to a programmatic change.
          onChange={next => setValue(normalizeTagline(next))}
        />
        <p className="mt-1 text-footnote text-grey-04 tabular-nums">{taglineLengthHint(tagline)}</p>
      </div>
    );
  }

  // Trimmed for the question of whether there is one at all. A tagline of nothing but spaces
  // is truthy, and rendering it puts an empty line between the name and the roles — which is
  // also how `fetchProfileHistory` reads it, where it trims to null for the debate byline.
  if (!tagline.trim()) return null;

  // One line. A tagline longer than the header is wide is truncated rather than wrapped —
  // there is a 220-character limit on what can be written here, and the roles under it are the
  // part of the header that is allowed to take more than a line.
  return <p className="truncate text-body text-text">{tagline}</p>;
}
