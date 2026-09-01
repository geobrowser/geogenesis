/**
 * GEO-2727. The link the marketing site points its "Sign in / Sign up" button at.
 *
 *     /explore?modal=signin&via=marketing
 *
 * That URL gets hardcoded off-repo, so it is a contract rather than an internal detail. The param
 * scheme lives in `core/deep-links/modal-deep-link`, shared with the debates panel link
 * (GEO-2746); what stays here is what is specific to signing in.
 */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

export const SIGN_IN_MODAL = DEEP_LINK_MODALS.signIn;

/**
 * Where the marketing button lands. Its own page owns nothing about this — the handler is global —
 * and it is only this link's default; the debates link happens to share it today but the two are
 * separate decisions.
 */
const SIGN_IN_PATHNAME = '/explore';

/**
 * Builds the link. Exposed through `NavUtils.toSignIn` as well, which is where anyone looking for
 * a route in this codebase looks first.
 *
 * Reading the link back is `useDeepLinkParams(SIGN_IN_MODAL)` rather than a `requestsSignInModal`
 * here — a per-feature wrapper over `requestsModal` had no callers once the protocol was shared.
 */
export function toSignIn(options?: { via?: string; pathname?: string }): string {
  return toModal({
    modal: SIGN_IN_MODAL,
    pathname: options?.pathname ?? SIGN_IN_PATHNAME,
    via: options?.via,
  });
}
