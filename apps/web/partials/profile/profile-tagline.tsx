'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { TAGLINE_MAX_LENGTH, TAGLINE_PROPERTY, normalizeTagline } from '~/core/profile/profile-ontology';
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
  const { value, setValue } = useEntityTextValue({
    entityId: personEntityId,
    spaceId,
    propertyId: TAGLINE_PROPERTY,
    propertyName: 'Tagline',
  });

  /*
   * `undefined` from the hook means the store holds no opinion — every render before the entity
   * hydrates — and only that falls back to the server's copy. `null` means the tagline was
   * cleared, and falling back there would put it straight back on screen.
   */
  const tagline = value === undefined ? (fallbackTagline ?? '') : (value ?? '');
  // Counted down rather than up. `12/220` asks the reader to do the subtraction, and the number
  // they actually want is how much room is left.
  const remaining = TAGLINE_MAX_LENGTH - tagline.length;

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
        <p className="mt-1 text-footnote text-grey-04">
          {remaining >= 0
            ? `${remaining} character${remaining === 1 ? '' : 's'} left`
            : // Unreachable by typing, and reachable by opening a tagline written before this
              // limit existed or by another client. Saying "0 left" over 260 characters of text
              // would read as a broken counter. Editing is what shortens it — `onChange` cuts
              // the value — so this does not promise anything a save will do.
              `Over the ${TAGLINE_MAX_LENGTH}-character limit — editing this will shorten it`}
        </p>
      </div>
    );
  }

  if (!tagline) return null;

  // One line. A tagline longer than the header is wide is truncated rather than wrapped —
  // there is a 220-character limit on what can be written here, and the roles under it are the
  // part of the header that is allowed to take more than a line.
  return <p className="truncate text-body text-text">{tagline}</p>;
}
