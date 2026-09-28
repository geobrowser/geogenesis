/**
 * The link that opens a person's bookable week on arrival.
 *
 *     /space/<profileSpaceId>?modal=availability&modalTarget=<profileSpaceId>
 *
 * Built on the scheme in `core/deep-links/modal-deep-link` — see there for why the trigger is a
 * query param and why it clears on arrival.
 *
 * The target names the person; the pathname is only where the link lands. Their profile, so the
 * recipient can see who they are booking, and closing the week leaves them somewhere that says so.
 */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';
import { NavUtils } from '~/core/utils/utils';

export const AVAILABILITY_MODAL = DEEP_LINK_MODALS.availability;

export function toAvailability(profileSpaceId: string, via?: string): string {
  return toModal({
    modal: AVAILABILITY_MODAL,
    pathname: NavUtils.toSpace(profileSpaceId),
    target: profileSpaceId,
    via,
  });
}

/** Absolute, for a clipboard. `origin` defaults to the page's own. */
export function availabilityLinkUrl(profileSpaceId: string, origin = window.location.origin): string {
  return new URL(toAvailability(profileSpaceId), origin).toString();
}

/** What both copy controls do; each confirms in its own way. Rejects if the clipboard refuses. */
export function copyAvailabilityLink(profileSpaceId: string): Promise<void> {
  return navigator.clipboard.writeText(availabilityLinkUrl(profileSpaceId));
}
