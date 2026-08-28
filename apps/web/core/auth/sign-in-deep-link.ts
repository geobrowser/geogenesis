/**
 * GEO-2727. The link the marketing site points its "Sign in / Sign up" button at.
 *
 *     /explore?modal=signin&source=marketing
 *
 * Once that site ships the URL is hardcoded off-repo, so the shape below is a contract rather
 * than an internal detail — hence one module owning the param names, the reader, and the builder,
 * so a change here is a change everywhere.
 *
 * On the shape:
 *
 * - `modal=signin`, not `signin=true`. A named value takes the next deep link (a different modal,
 *   an entity action) without a new param each time, and has no meaningless `signin=false` state.
 * - `source` already exists in the repo — `buildBlockLink` writes `?source=copy_link` and
 *   `block-reorder` reads it — so attribution reuses that key rather than inventing a parallel one.
 *   Values are lowercase, `snake_case` when they need more than a word, matching `copy_link`.
 *
 * Both params are stripped once the trigger has been acted on, so a refresh, a back button, or a
 * URL copied out of the address bar doesn't reopen the modal for someone who never asked.
 */

export const MODAL_PARAM = 'modal';
export const SOURCE_PARAM = 'source';

/** The one `modal` value in use today. Others join it here as deep links are added. */
export const SIGN_IN_MODAL = 'signin';

/** Where the marketing button lands. Its own page owns nothing about this — the handler is global. */
const SIGN_IN_PATHNAME = '/explore';

/**
 * Structural rather than `URLSearchParams` itself: what `useSearchParams` hands back is a
 * `ReadonlyURLSearchParams`, and narrowing to the concrete class would make every caller cast.
 */
type ReadableParams = Pick<URLSearchParams, 'get' | 'toString'> | null | undefined;

/** True when the URL is asking for the sign-in modal. */
export function requestsSignInModal(params: ReadableParams): boolean {
  return params?.get(MODAL_PARAM) === SIGN_IN_MODAL;
}

/**
 * The attribution value carried alongside the trigger, if any. Free-form on purpose: the marketing
 * site, an email, or a partner page can each name itself without a deploy here.
 */
export function signInModalSource(params: ReadableParams): string | null {
  return params?.get(SOURCE_PARAM) || null;
}

/**
 * The same URL with the trigger removed, preserving every other param — the viewer may have
 * arrived on a route that carries its own state, and dropping it would be a worse bug than the
 * one this clearing exists to prevent.
 */
export function urlWithoutSignInModal(pathname: string, params: ReadableParams): string {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(MODAL_PARAM);
  next.delete(SOURCE_PARAM);
  const search = next.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Builds the link. Exposed through `NavUtils.toSignIn` as well, which is where anyone looking for
 * a route in this codebase looks first.
 */
export function toSignIn(options?: { source?: string; pathname?: string }): string {
  const params = new URLSearchParams();
  params.set(MODAL_PARAM, SIGN_IN_MODAL);
  if (options?.source) params.set(SOURCE_PARAM, options.source);
  return `${options?.pathname ?? SIGN_IN_PATHNAME}?${params.toString()}`;
}
