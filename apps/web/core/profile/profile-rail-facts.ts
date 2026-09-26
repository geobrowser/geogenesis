import type { Space } from '~/core/io/dto/spaces';
import { type ProfileLink, profileLinks } from '~/core/profile/profile-links';
import { TAGLINE_PROPERTY } from '~/core/profile/profile-ontology';
import { Entities } from '~/core/utils/entity';

/**
 * The parts of a profile's rail that come from the space rather than a query.
 *
 * All five are read off `space.entity`, and three surfaces need them: the rail
 * in the space layout, the About route that renders the same sections in the
 * column below 1024px, and the record tabs, whose About panel is the same thing
 * again for a side panel — which has no rail at any width.
 *
 * They were derived separately in each, five lines at a time, with the layout's
 * copy nullable-safe and the route's not. Two of the five are a `map` over a
 * shape the caller has to get exactly right (`profileLinks` wants
 * `{ property: { id } , value }`, which is not what the API hands back), and a
 * fourth surface would have been a fourth chance to get it wrong quietly: a
 * mistyped property id there means a link silently missing, not an error.
 */
export type ProfileRailFacts = {
  /** Types on the person entity — Person and Space, on one entity. */
  types: { id: string; name: string | null }[];
  links: ProfileLink[];
  /** Where the space's own record is shown, folded away. */
  systemEntityId: string;
  address: string | null;
  spaceType: 'DAO' | 'PERSONAL';
  /**
   * The bio, as the server already read it.
   *
   * The rail renders this from the sync store, which hydrates the person entity
   * over the network after the page is already on screen — so the About card
   * painted without a bio and then grew one, pushing every fact under it down by
   * the height of six lines of prose. The store stays authoritative once it has
   * the entity; this is only what to show until then.
   */
  description: string | null;
  /**
   * The line under the name, read the same way and for the same reason.
   *
   * Shown in the header rather than the rail, but derived here because this is where the
   * space's own values are already unpacked — and because the header has the same blank-then-
   * grown problem the bio had, one line high and directly above the roles.
   */
  tagline: string | null;
};

/**
 * `space` is nullable because two of the three callers read it from a query that
 * may not have answered yet, and the fallbacks are theirs: an unresolved space
 * is a personal one with no links and no types rather than a missing card.
 */
export function profileRailFacts(
  space: Pick<Space, 'entity' | 'address' | 'type'> | null | undefined,
  spaceId: string
): ProfileRailFacts {
  return {
    types: (space?.entity?.types ?? []).map(type => ({ id: type.id, name: type.name ?? null })),
    links: profileLinks(
      (space?.entity?.values ?? []).map(value => ({ property: { id: value.property.id }, value: value.value }))
    ),
    systemEntityId: space?.entity?.id ?? spaceId,
    // Scoped to this space, matching the store selector the rail reads: a
    // profile states the bio written here, not one borrowed from elsewhere.
    description: Entities.descriptionInSpace(space?.entity?.values ?? [], spaceId),
    tagline: Entities.textInSpace(space?.entity?.values ?? [], TAGLINE_PROPERTY, spaceId),
    address: space?.address ?? null,
    spaceType: space?.type ?? 'PERSONAL',
  };
}
