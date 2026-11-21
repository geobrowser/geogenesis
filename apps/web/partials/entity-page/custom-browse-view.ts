import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { ID } from '~/core/id';
import type { Space } from '~/core/io/dto/spaces';
import { type EntityTemplateId, resolveEntityTemplateFromTypes } from '~/core/templates/registry';
import { Spaces } from '~/core/utils/space';

export type CustomBrowseView = EntityTemplateId | 'person-pending' | 'generic' | 'pending';

/**
 * The decision itself, with no hooks in it.
 *
 * Exported and pure because it is a routing rule rather than a rendering
 * detail: which read surface somebody gets, from inputs that arrive at
 * different times. The hook in `entity-page-body` is the only place
 * those inputs are gathered.
 */
export function customBrowseView({
  entityId,
  entity,
  isLoadingEntity,
  space,
  isLoadingSpace,
  isEditing,
  enableV2Templates = false,
}: {
  entityId: string;
  entity: { types: { id: string }[] } | null | undefined;
  isLoadingEntity: boolean;
  space: Pick<Space, 'type' | 'entity'> | null | undefined;
  isLoadingSpace: boolean;
  isEditing: boolean;
  enableV2Templates?: boolean;
}): CustomBrowseView {
  // The types decide which page this is, so until they are known there is no page to draw. Falling
  // through to the generic one meanwhile rendered the value sheet for a claim or a topic and then
  // replaced it a moment later, which read as the page loading twice.
  if (!entity) return isLoadingEntity ? 'pending' : 'generic';

  const template = resolveEntityTemplateFromTypes(entity.types, { includeV2: enableV2Templates });
  if (!template) return 'generic';

  if (template.keepInEditMode) return template.id;
  if (isEditing) return 'generic';

  /*
   * A profile is the *space's* view of a person, not the type's.
   *
   * `isPersonProfileSpace` wants a PERSONAL space whose own entity is a Person,
   * and this wants, on top of that, the entity being read to *be* that entity.
   * Both halves matter and the first has burned this codebase before: a Person
   * written into a DAO space satisfies the type check alone, and was once handed
   * profile tabs whose routes answered 404. A personal space also holds entities
   * besides its owner, and those are not profiles either.
   */
  if (template.requiresSpaceCheck) {
    // `person-pending`, not `pending`: the caller holds back the *body* on this
    // one and draws the header regardless. A profile and an ordinary Person
    // entity have the same cover, avatar, name and bio, so there is nothing to
    // get wrong by drawing them — where blanking the page would make every
    // Person in a DAO space wait out a space read for a view it was never going
    // to get.
    if (!space) return isLoadingSpace ? 'person-pending' : 'generic';
    if (Spaces.isPersonProfileSpace(space) && space.entity && ID.equals(space.entity.id, entityId)) {
      return template.id;
    }
    return 'generic';
  }

  return template.id;
}

export type CommentTargetEntityType = 'claim' | 'topic' | 'debate' | 'entity';

/**
 * The logical entity type attached to comment analytics when a typed entity falls back to the
 * generic footer (for example while editing). Browse-specific views pass the same values directly,
 * so this keeps both render paths in one event family.
 */
export function commentTargetEntityType(
  entity: { types: { id: string }[] } | null | undefined
): CommentTargetEntityType {
  if (!entity) return 'entity';
  if (isDebateEntity(entity.types)) return 'debate';

  const view = resolveEntityTemplateFromTypes(entity.types, { includeV2: false })?.id ?? null;
  if (view === 'claim' || view === 'topic') return view;

  return 'entity';
}

/**
 * Whether the space has to be read before this entity's view is known.
 *
 * The one question `useSpace` is enabled by, and it is asked through
 * `resolveEntityTemplateFromTypes` rather than restated. Restating it is exactly what went wrong:
 * the gate tested Person alone, so an entity typed Person *and* Claim — which
 * the routing test covers explicitly — fetched a space that the claim branch
 * above was always going to discard. A gate that repeats a precedence it does
 * not own drifts from it the first time the precedence changes.
 */
export function needsSpaceForView({
  entity,
  isEditing,
  enableV2Templates = false,
}: {
  entity: { types: { id: string }[] } | null | undefined;
  isEditing: boolean;
  enableV2Templates?: boolean;
}): boolean {
  if (isEditing || !entity) return false;

  const template = resolveEntityTemplateFromTypes(entity.types, { includeV2: enableV2Templates });
  return template?.requiresSpaceCheck ?? false;
}
