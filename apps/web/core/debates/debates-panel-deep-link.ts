/**
 * GEO-2746. The link that opens the debates hub on arrival.
 *
 *     /explore?modal=debates
 *     /explore?modal=debates&modalTarget=people
 *     /space/<id>/questions?modal=debates&via=email
 *
 * Built on the scheme in `core/deep-links/modal-deep-link` — see there for why the trigger is a
 * query param, why the sub-target is not a fragment, and why these clear on arrival.
 *
 * Any page: the hub is mounted app-wide in `app/entry.tsx`, so it has no host route to be
 * contextual to. `/explore` is only the default this builder fills in.
 */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

import type { DebatesHubTab } from '~/atoms';

export const DEBATES_MODAL = DEEP_LINK_MODALS.debates;

/** Where a link lands when the caller doesn't say. The hub itself works on any route. */
const DEBATES_PATHNAME = '/explore';

/**
 * Every tab a link may name. A record rather than an array so the compiler makes a new
 * `DebatesHubTab` show up here, instead of letting it silently become the one tab no link can
 * reach — `readonly DebatesHubTab[]` type-checks each entry but never that they are all present.
 */
const TABS: Record<DebatesHubTab, true> = { claims: true, people: true, matches: true, requests: true };

/**
 * The hub's reading of `modalTarget`: a tab name, or null to let the hub pick its own landing tab.
 *
 * An unrecognised value is null rather than an error: these links are written by hand and pasted
 * into emails, and a stale tab name should open the hub on its default rather than fail to open it.
 *
 * No signed-out filtering here on purpose. The hub already coerces a signed-in-only tab to Claims
 * for an anonymous viewer (`visibleTab` in `debates-hub-panel`, GEO-2725), and a second copy of
 * that rule would be one to keep in step for no gain.
 */
export function debatesPanelTab(target: string | null): DebatesHubTab | null {
  // `Object.hasOwn` rather than `in`, which would walk the prototype and resolve
  // `?modalTarget=toString` to a tab.
  return target !== null && Object.hasOwn(TABS, target) ? (target as DebatesHubTab) : null;
}

/**
 * Builds the link. Exposed through `NavUtils.toDebatesPanel` as well, which is where anyone
 * looking for a route in this codebase looks first.
 *
 * Reading the link back is `useDeepLinkParams(DEBATES_MODAL)` rather than a `requestsDebatesPanel`
 * here — a per-feature wrapper over `requestsModal` had no callers once the protocol was shared.
 */
export function toDebatesPanel(options?: { tab?: DebatesHubTab; via?: string; pathname?: string }): string {
  return toModal({
    modal: DEBATES_MODAL,
    pathname: options?.pathname ?? DEBATES_PATHNAME,
    target: options?.tab,
    via: options?.via,
  });
}
