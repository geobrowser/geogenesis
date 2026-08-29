/**
 * GEO-2746. The link that opens the debates hub on arrival.
 *
 *     /explore?modal=debates
 *     /explore?modal=debates&modalTab=people
 *     /space/<id>/questions?modal=debates&source=email
 *
 * Built on the scheme GEO-2727 established — see `core/deep-links/modal-deep-link` for why the
 * trigger is a query param, why the sub-target is not a fragment, and why these clear on arrival.
 *
 * Any page: the hub is mounted app-wide in `app/entry.tsx`, so it has no host route to be
 * contextual to. `/explore` is only the default this builder fills in.
 */
import {
  type ReadableParams,
  modalSource,
  modalTab,
  requestsModal,
  toModal,
  urlWithoutModal,
} from '~/core/deep-links/modal-deep-link';

import type { DebatesHubTab } from '~/atoms';

export const DEBATES_MODAL = 'debates';

/** Where a link lands when the caller doesn't say. The hub itself works on any route. */
const DEBATES_PATHNAME = '/explore';

const TABS: readonly DebatesHubTab[] = ['claims', 'people', 'matches', 'requests'];

export function requestsDebatesPanel(params: ReadableParams): boolean {
  return requestsModal(params, DEBATES_MODAL);
}

/**
 * The requested tab, or null to let the hub pick its own landing tab.
 *
 * An unrecognised value is null rather than an error: these links are written by hand and pasted
 * into emails, and a stale tab name should open the hub on its default rather than fail to open it.
 *
 * No signed-out filtering here on purpose. The hub already coerces a signed-in-only tab to Claims
 * for an anonymous viewer (`visibleTab` in `debates-hub-panel`, GEO-2725), and a second copy of
 * that rule would be one to keep in step for no gain.
 */
export function debatesPanelTab(params: ReadableParams): DebatesHubTab | null {
  const value = modalTab(params);
  return TABS.find(tab => tab === value) ?? null;
}

/** Attribution, if the link carried any. */
export function debatesPanelSource(params: ReadableParams): string | null {
  return modalSource(params);
}

/** The same URL with the trigger removed, preserving every other param and the fragment. */
export function urlWithoutDebatesPanel(pathname: string, params: ReadableParams, hash = ''): string {
  return urlWithoutModal(pathname, params, hash);
}

/**
 * Builds the link. Exposed through `NavUtils.toDebatesPanel` as well, which is where anyone
 * looking for a route in this codebase looks first.
 */
export function toDebatesPanel(options?: { tab?: DebatesHubTab; source?: string; pathname?: string }): string {
  return toModal({
    modal: DEBATES_MODAL,
    pathname: options?.pathname ?? DEBATES_PATHNAME,
    tab: options?.tab,
    source: options?.source,
  });
}
