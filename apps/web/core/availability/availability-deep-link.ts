/**
 * The link that opens a person's bookable week on arrival.
 *
 *     /space/<profileSpaceId>?modal=availability
 *
 * Built on the scheme in `core/deep-links/modal-deep-link` — see there for why the trigger is a
 * query param and why it clears on arrival.
 *
 * The path names the person, with no `modalTarget` repeating it: the link lands on their profile
 * so the recipient can see who they are booking, and a second copy of the id could only disagree
 * with the first. So it acts on a profile's own root and nowhere else — see
 * {@link profileSpaceIdFromPath}.
 */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';
import { NavUtils } from '~/core/utils/utils';

export const AVAILABILITY_MODAL = DEEP_LINK_MODALS.availability;

export function toAvailability(profileSpaceId: string, via?: string): string {
  return toModal({ modal: AVAILABILITY_MODAL, pathname: NavUtils.toSpace(profileSpaceId), via });
}

/**
 * The space a link landed on, when it landed on a space's own root — `/space/<id>` and nothing
 * deeper. An entity page inside a personal space is not that person, and guessing otherwise would
 * open someone's week over a page about something else. Whether the space is a person is only
 * known once it loads, so that check belongs to the modal.
 */
export function profileSpaceIdFromPath(segments: string[]): string | null {
  return segments.length === 2 && segments[0] === 'space' ? segments[1] : null;
}

/** Said when a link lands anywhere that is not a person's profile. Only a hand-edited link does. */
export const NOT_A_PERSON_MESSAGE = 'This link doesn’t point to a person’s availability.';

/** Absolute, for a clipboard. `origin` defaults to the page's own. */
export function availabilityLinkUrl(profileSpaceId: string, origin = window.location.origin): string {
  return new URL(toAvailability(profileSpaceId), origin).toString();
}

/** What both copy controls do; each confirms in its own way. Rejects if the clipboard refuses. */
export function copyAvailabilityLink(profileSpaceId: string): Promise<void> {
  return navigator.clipboard.writeText(availabilityLinkUrl(profileSpaceId));
}
