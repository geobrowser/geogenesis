import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { ID } from '~/core/id';
import type { Space } from '~/core/io/dto/spaces';
import { Spaces } from '~/core/utils/space';

export type CustomBrowseView = 'claim' | 'topic' | 'person' | 'person-pending' | 'generic' | 'pending';

/**
 * The decision itself, with no hooks in it.
 *
 * Exported and pure because it is a routing rule rather than a rendering
 * detail: which of four read surfaces somebody gets, from four inputs that
 * arrive at different times. The hook in `entity-page-body` is the only place
 * those inputs are gathered.
 */
export function customBrowseView({
  entityId,
  entity,
  isLoadingEntity,
  space,
  isLoadingSpace,
  isEditing,
}: {
  entityId: string;
  entity: { types: { id: string }[] } | null | undefined;
  isLoadingEntity: boolean;
  space: Pick<Space, 'type' | 'entity'> | null | undefined;
  isLoadingSpace: boolean;
  isEditing: boolean;
}): CustomBrowseView {
  // The types decide which page this is, so until they are known there is no page to draw. Falling
  // through to the generic one meanwhile rendered the value sheet for a claim or a topic and then
  // replaced it a moment later, which read as the page loading twice.
  if (!entity) return isLoadingEntity ? 'pending' : 'generic';

  const byType = viewFromTypes(entity);

  if (byType === 'claim') return 'claim';
  if (byType === 'topic') return 'topic';
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
  if (byType === 'person') {
    // `person-pending`, not `pending`: the caller holds back the *body* on this
    // one and draws the header regardless. A profile and an ordinary Person
    // entity have the same cover, avatar, name and bio, so there is nothing to
    // get wrong by drawing them — where blanking the page would make every
    // Person in a DAO space wait out a space read for a view it was never going
    // to get.
    if (!space) return isLoadingSpace ? 'person-pending' : 'generic';
    if (Spaces.isPersonProfileSpace(space) && space.entity && ID.equals(space.entity.id, entityId)) return 'person';
  }

  return 'generic';
}

/**
 * The view an entity's own types put it in line for, before any space is read.
 *
 * Precedence lives here and only here. Claim beats Topic, so an entity typed as
 * both reads as the narrower of the two — a claim is a thing to take a side on,
 * which is more specific than a subject heading — and both beat Person for the
 * same reason.
 *
 * `'person'` is a *candidate*, not an answer: whether that person's page is a
 * profile is the space's to say, and `customBrowseView` asks it.
 */
function viewFromTypes(entity: { types: { id: string }[] }): 'claim' | 'topic' | 'person' | null {
  if (entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) return 'claim';
  if (entity.types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) return 'topic';
  if (entity.types.some(type => ID.equals(type.id, SystemIds.PERSON_TYPE))) return 'person';

  return null;
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

  const view = viewFromTypes(entity);
  if (view === 'claim' || view === 'topic') return view;

  return 'entity';
}

/**
 * Whether the space has to be read before this entity's view is known.
 *
 * The one question `useSpace` is enabled by, and it is asked through
 * `viewFromTypes` rather than restated. Restating it is exactly what went wrong:
 * the gate tested Person alone, so an entity typed Person *and* Claim — which
 * the routing test covers explicitly — fetched a space that the claim branch
 * above was always going to discard. A gate that repeats a precedence it does
 * not own drifts from it the first time the precedence changes.
 */
export function needsSpaceForView({
  entity,
  isEditing,
}: {
  entity: { types: { id: string }[] } | null | undefined;
  isEditing: boolean;
}): boolean {
  if (isEditing || !entity) return false;

  return viewFromTypes(entity) === 'person';
}
