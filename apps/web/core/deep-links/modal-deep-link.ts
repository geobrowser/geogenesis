/**
 * The scheme behind every link that opens something on arrival.
 *
 *     /explore?modal=signin&source=marketing          GEO-2727
 *     /explore?modal=debates&modalTab=people          GEO-2746
 *
 * GEO-2727 shipped this as a sign-in-only module. GEO-2746 needed the same three things — a
 * trigger param, a clearing rule, attribution — so the scheme lives here and each link keeps only
 * what is specific to it. A second trigger param would have made the third link a coin toss.
 *
 * On the shape:
 *
 * - `modal` names *what* to open rather than a boolean per feature, so a new link is a new value
 *   rather than a new param, and there is no meaningless `signin=false` state. "Modal" is loose —
 *   the debates hub is a companion panel on desktop — but it is the shipped key and a URL contract,
 *   so it stays. Read it as "the thing to open".
 * - `modalTab` carries a sub-target. Deliberately not `tab`, which the ranking compose screen
 *   already reads (`use-ranking-block-state`), and deliberately not a fragment: fragments here
 *   address a position in the document — `block-reorder` resolves a linked block out of
 *   `location.hash` — and a panel tab is not one. Fragments are preserved by the clearing below
 *   rather than consumed by it.
 * - `source` is attribution, free-form, optional, and never required for the trigger to fire.
 *
 * The trigger params are cleared once acted on, so a refresh, a back button, or a URL copied out
 * of the address bar does not reopen something for someone who never asked.
 *
 * Note this is the *one-shot* half of a split the repo already contains. `buildBlockLink`
 * (GEO-2681) writes `?source=copy_link#blockId` and never clears it, because that link is a
 * permalink — a recipient refreshing it should land on the block again. Links here address an
 * action rather than a location, so they clear. Both are right; the difference is what the URL
 * is for, not an inconsistency to be resolved.
 */

export const MODAL_PARAM = 'modal';
export const MODAL_TAB_PARAM = 'modalTab';
export const SOURCE_PARAM = 'source';

/**
 * Structural rather than `URLSearchParams` itself: what `useSearchParams` hands back is a
 * `ReadonlyURLSearchParams`, and narrowing to the concrete class would make every caller cast.
 */
export type ReadableParams = Pick<URLSearchParams, 'get' | 'toString'> | null | undefined;

/** True when the URL is asking for this particular overlay. */
export function requestsModal(params: ReadableParams, modal: string): boolean {
  return params?.get(MODAL_PARAM) === modal;
}

/** The sub-target, if the link named one. Validating it belongs to whoever owns the modal. */
export function modalTab(params: ReadableParams): string | null {
  return params?.get(MODAL_TAB_PARAM) || null;
}

/**
 * The attribution carried alongside the trigger. Free-form on purpose: the marketing site, an
 * email, or a partner page can each name itself without a deploy here.
 */
export function modalSource(params: ReadableParams): string | null {
  return params?.get(SOURCE_PARAM) || null;
}

/**
 * The same URL with the trigger removed, keeping every other param — the viewer may have arrived
 * on a route that carries its own state, and dropping it would be a worse bug than the one this
 * clearing exists to prevent.
 *
 * The fragment has to be passed in: `usePathname` and `useSearchParams` both omit it, and
 * `replaceState` rewrites the whole URL, so a fragment left out here is a fragment thrown away.
 */
export function urlWithoutModal(pathname: string, params: ReadableParams, hash = ''): string {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(MODAL_PARAM);
  next.delete(MODAL_TAB_PARAM);
  next.delete(SOURCE_PARAM);
  const search = next.toString();
  // Accepts `location.hash` as-is, which already carries the `#`, and tolerates a bare id.
  const fragment = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  return `${pathname}${search ? `?${search}` : ''}${fragment}`;
}

/** Builds a link. Each feature wraps this with its own modal value and default pathname. */
export function toModal(options: { modal: string; pathname: string; tab?: string; source?: string }): string {
  const params = new URLSearchParams();
  params.set(MODAL_PARAM, options.modal);
  if (options.tab) params.set(MODAL_TAB_PARAM, options.tab);
  if (options.source) params.set(SOURCE_PARAM, options.source);
  return `${options.pathname}?${params.toString()}`;
}
