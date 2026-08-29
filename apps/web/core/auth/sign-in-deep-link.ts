/**
 * GEO-2727. The link the marketing site points its "Sign in / Sign up" button at.
 *
 *     /explore?modal=signin&source=marketing
 *
 * That URL is hardcoded off-repo, so it is a contract rather than an internal detail. The param
 * scheme it established now lives in `core/deep-links/modal-deep-link`, shared with the debates
 * panel link (GEO-2746); what stays here is what is specific to signing in — the `modal` value and
 * where the marketing button lands. The URL itself is unchanged.
 */
import {
  MODAL_PARAM,
  type ReadableParams,
  SOURCE_PARAM,
  modalSource,
  requestsModal,
  toModal,
  urlWithoutModal,
} from '~/core/deep-links/modal-deep-link';

export { MODAL_PARAM, SOURCE_PARAM };

export const SIGN_IN_MODAL = 'signin';

/** Where the marketing button lands. Its own page owns nothing about this — the handler is global. */
const SIGN_IN_PATHNAME = '/explore';

/** True when the URL is asking for the sign-in modal. */
export function requestsSignInModal(params: ReadableParams): boolean {
  return requestsModal(params, SIGN_IN_MODAL);
}

/** The attribution value carried alongside the trigger, if any. */
export function signInModalSource(params: ReadableParams): string | null {
  return modalSource(params);
}

/** The same URL with the trigger removed, preserving every other param and the fragment. */
export function urlWithoutSignInModal(pathname: string, params: ReadableParams, hash = ''): string {
  return urlWithoutModal(pathname, params, hash);
}

/**
 * Builds the link. Exposed through `NavUtils.toSignIn` as well, which is where anyone looking for
 * a route in this codebase looks first.
 */
export function toSignIn(options?: { source?: string; pathname?: string }): string {
  return toModal({
    modal: SIGN_IN_MODAL,
    pathname: options?.pathname ?? SIGN_IN_PATHNAME,
    source: options?.source,
  });
}
