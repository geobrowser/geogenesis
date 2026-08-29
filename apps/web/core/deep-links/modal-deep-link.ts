/**
 * The scheme behind every link that opens something on arrival.
 *
 *     /explore?modal=signin&via=marketing              GEO-2727
 *     /explore?modal=debates&modalTarget=people        GEO-2746
 *
 * The rule the repo already follows, written down: **a fragment addresses a position in the
 * document, a query param triggers an action.** `buildBlockLink` puts a block id in the fragment
 * and `comments-section` scrolls to `#entity-comments`; both are positions. Opening a panel is not,
 * so it lives in the query string — and the clearing below preserves fragments rather than eating
 * them.
 *
 * On each param:
 *
 * - `modal` names *what* to open, so a new link is a new value rather than a new param, and there
 *   is no meaningless `signin=false` state. Every value is in `DEEP_LINK_MODALS` below, which is
 *   the list to read before adding one. "Modal" is loose — the debates hub is a companion panel on
 *   desktop — but it is the shipped key in a URL that gets hardcoded off-repo, and renaming it
 *   would break that for a cosmetic gain. Read it as "the thing to open".
 * - `modalTarget` is a sub-target whose meaning belongs to the `modal` value: a tab for the debates
 *   hub, an id for whatever comes next. Deliberately generic — a `modalTab` would have needed a
 *   `modalEntity` beside it the first time a link pointed at something that wasn't a tab. And
 *   deliberately not `tab`, which the ranking compose screen already reads.
 * - `via` is attribution: free-form, optional, never required for the trigger to fire.
 *
 *   Attribution is *not* `source`. `source` is already a trigger elsewhere — `block-reorder` does
 *   nothing unless it reads `copy_link` — and one key cannot be both "who sent you" and "what to
 *   do". While it was, a URL carrying `modal` and `source=copy_link` had its block reveal silently
 *   stripped by the clearing below. `via` leaves `source` to the block link untouched.
 *
 * Trigger params are cleared once acted on, so a refresh, a back button, or a URL copied out of
 * the address bar does not reopen something for someone who never asked.
 *
 * Note this is the *one-shot* half of a split the repo contains on purpose. `buildBlockLink`
 * (GEO-2681) writes `?source=copy_link#blockId` and never clears it, because that link is a
 * permalink — a recipient refreshing it should land on the block again. Links here address an
 * action rather than a location, so they clear. The difference is what the URL is for, not an
 * inconsistency to be resolved.
 */

/**
 * Every deep link in the app. Values are lowercase and stable — they appear in URLs written down
 * outside this repo — and live here rather than in each feature so that two features cannot pick
 * the same one without the conflict being visible.
 */
export const DEEP_LINK_MODALS = {
  signIn: 'signin',
  debates: 'debates',
} as const;

export type ModalDeepLink = (typeof DEEP_LINK_MODALS)[keyof typeof DEEP_LINK_MODALS];

export const MODAL_PARAM = 'modal';
export const MODAL_TARGET_PARAM = 'modalTarget';
export const VIA_PARAM = 'via';

/**
 * Structural rather than `URLSearchParams` itself: what `useSearchParams` hands back is a
 * `ReadonlyURLSearchParams`, and narrowing to the concrete class would make every caller cast.
 */
export type ReadableParams = Pick<URLSearchParams, 'get' | 'toString'> | null | undefined;

/** True when the URL is asking for this particular overlay. */
export function requestsModal(params: ReadableParams, modal: ModalDeepLink): boolean {
  return params?.get(MODAL_PARAM) === modal;
}

/** The sub-target, if the link named one. Interpreting it belongs to whoever owns the modal. */
export function modalTarget(params: ReadableParams): string | null {
  return params?.get(MODAL_TARGET_PARAM) || null;
}

/** The attribution carried alongside the trigger, if any. */
export function modalVia(params: ReadableParams): string | null {
  return params?.get(VIA_PARAM) || null;
}

/**
 * The same URL with the trigger removed, keeping every other param — the viewer may have arrived
 * on a route that carries its own state, and dropping it would be a worse bug than the one this
 * clearing exists to prevent. `source` in particular is left alone: it belongs to the block link.
 *
 * The fragment has to be passed in: `usePathname` and `useSearchParams` both omit it, and
 * `replaceState` rewrites the whole URL, so a fragment left out here is a fragment thrown away.
 */
export function urlWithoutModal(pathname: string, params: ReadableParams, hash = ''): string {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(MODAL_PARAM);
  next.delete(MODAL_TARGET_PARAM);
  next.delete(VIA_PARAM);
  const search = next.toString();
  // Accepts `location.hash` as-is, which already carries the `#`, and tolerates a bare id.
  const fragment = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  return `${pathname}${search ? `?${search}` : ''}${fragment}`;
}

/** Builds a link. Each feature wraps this with its own modal value and default pathname. */
export function toModal(options: { modal: ModalDeepLink; pathname: string; target?: string; via?: string }): string {
  const params = new URLSearchParams();
  params.set(MODAL_PARAM, options.modal);
  if (options.target) params.set(MODAL_TARGET_PARAM, options.target);
  if (options.via) params.set(VIA_PARAM, options.via);
  return `${options.pathname}?${params.toString()}`;
}
