import { NavUtils } from '~/core/utils/utils';

/**
 * The query parameter that turns a profile URL into "pick a time to debate this person".
 *
 * A profile rather than a route of its own, so the link still lands somewhere that says who this
 * is — the modal opens over their page, and closing it leaves the recipient on it.
 */
export const AVAILABILITY_LINK_PARAM = 'availability';

/** The path for a person's availability link, keyed by their personal space. */
export function availabilityLinkPath(profileSpaceId: string) {
  return `${NavUtils.toSpace(profileSpaceId)}?${AVAILABILITY_LINK_PARAM}=1`;
}

/** The absolute link, for a clipboard. `origin` defaults to the page's own. */
export function availabilityLinkUrl(profileSpaceId: string, origin = window.location.origin) {
  return new URL(availabilityLinkPath(profileSpaceId), origin).toString();
}

/** Present at all counts, so a hand-edited `?availability` still opens it. */
export function hasAvailabilityLinkParam(searchParams: Pick<URLSearchParams, 'has'> | null | undefined) {
  return Boolean(searchParams?.has(AVAILABILITY_LINK_PARAM));
}

/** The same query string minus the link's parameter, for putting the URL back once it is closed. */
export function withoutAvailabilityLinkParam(pathname: string, searchParams: URLSearchParams | string) {
  const next = new URLSearchParams(searchParams);
  next.delete(AVAILABILITY_LINK_PARAM);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
