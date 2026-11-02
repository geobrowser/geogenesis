import type { ActionContext } from '~/core/action-context';
import { runObservedAction } from '~/core/analytics-operations';
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
 *
 *     /space/<profileSpaceId>?modal=availability&modalTarget=<requestId>
 *
 * With a `modalTarget`, the week *moves* that scheduled request instead of proposing a new one.
 * It is what a scheduling email's "Choose different time" opens: the other person's week, where
 * picking a slot reschedules the request the email is about. Declining and booking afresh would
 * send the proposer the "declined, find someone else" email a minute before a new invite from the
 * same person; a reschedule sends them "proposed a different time" and keeps one request.
 *
 *     /space/<profileSpaceId>?modal=availability&modalTarget=2026-10-23T13:00:00Z
 *
 * With an instant as the `modalTarget`, the week opens with that time already picked, ready to send
 * (GEO-3429). It is what "none of these work"'s emailed time buttons open: the mover's week, with
 * the time the recipient tapped. Told from a request id by shape (see {@link startFromTarget}).
 */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';
import { copyShareLink } from '~/core/sharing/share-handoff';
import { createShareLink } from '~/core/sharing/share-link';
import { NavUtils } from '~/core/utils/utils';

export const AVAILABILITY_MODAL = DEEP_LINK_MODALS.availability;

export function toAvailability(
  profileSpaceId: string,
  options: { via?: string; rescheduleRequestId?: string | null; pickedStart?: string | null } = {}
): string {
  return toModal({
    modal: AVAILABILITY_MODAL,
    pathname: NavUtils.toSpace(profileSpaceId),
    target: options.rescheduleRequestId ?? options.pickedStart ?? undefined,
    via: options.via,
  });
}

// geo-chat request ids are UUIDs, dashed in the links it writes and dashless in its JSON.
const REQUEST_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * The scheduled request a link's `modalTarget` names, or null when it names none. Here that is the
 * request to reschedule: anything else is ignored rather than refused, so the link still opens the
 * week, and booking from it proposes a new request, the best a garbled link can mean. The Running
 * late and Can't make it links (GEO-3427) read their request with this too.
 */
export function requestIdFromTarget(target: string | null): string | null {
  return target && REQUEST_ID.test(target) ? target : null;
}

// An instant as geo-chat writes it into a link: UTC, to the second (`2026-10-23T13:00:00Z`).
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

/**
 * The time a link's `modalTarget` picks in advance, as an ISO instant, or null when it names none
 * (GEO-3429). Anything that isn't a UTC instant is ignored, like a target that isn't a request id:
 * the week still opens, with nothing picked.
 */
export function startFromTarget(target: string | null): string | null {
  if (!target || !INSTANT.test(target)) return null;
  const at = Date.parse(target);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
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

/**
 * Attribution on every copied link, so an arrival from one can be told from a scheduling email's
 * (which geo-notifications builds) and from someone typing the URL. Read back as `link_source` on
 * `debate_availability_link_opened`.
 */
const AVAILABILITY_LINK_VIA = 'share';

/**
 * A link's `via` as analytics may record it. The URL is anyone's to edit, so only a value this app
 * writes passes through; anything else is `other` rather than whatever text it carried. Scheduling
 * emails (geo-chat's `debate_emails.rs`) send none, so they read as `none`.
 */
export function availabilityLinkSource(via: string | null): typeof AVAILABILITY_LINK_VIA | 'other' | 'none' {
  if (!via) return 'none';
  return via === AVAILABILITY_LINK_VIA ? AVAILABILITY_LINK_VIA : 'other';
}

/** Absolute, for a clipboard. `origin` defaults to the page's own. */
export function availabilityLinkUrl(profileSpaceId: string, origin = window.location.origin): string {
  return new URL(toAvailability(profileSpaceId, { via: AVAILABILITY_LINK_VIA }), origin).toString();
}

/** What both copy controls do; each confirms in its own way. Rejects if the clipboard refuses. */
export function copyAvailabilityLink(profileSpaceId: string, context: ActionContext): Promise<void> {
  const link = createShareLink(availabilityLinkUrl(profileSpaceId), 'availability', profileSpaceId, 'copy_link');
  return runObservedAction('share', context, () => copyShareLink(link, context));
}
