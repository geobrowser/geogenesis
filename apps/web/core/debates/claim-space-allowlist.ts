import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { normId } from '~/core/utils/norm-id';

/**
 * The spaces a viewer is allowed to see claims from.
 *
 * Two sources, matching the two lists the app already builds for a viewer:
 *
 * - the featured spaces behind the explore panel's "Join spaces" section, and
 * - the spaces the browse sidebar lists them as a member or an editor of.
 *
 * Both come off `fetchBrowseSidebarData`, which is where those two surfaces get them: its
 * `featured` rows are the `fetchFeaturedSpaces` traversal, and `editorOf` / `memberOf` are the
 * sidebar's own sections. Note that `featured` there has already had the viewer's own spaces
 * subtracted, so the union — not either list alone — is the full set.
 *
 * Ids are normalized, so membership has to be tested with {@link isClaimSpaceAllowed} rather than
 * against a raw id from a claim row.
 */
export function buildClaimSpaceAllowlist({
  featured,
  editorOf,
  memberOf,
  personalSpaceId,
}: {
  featured: BrowseSpaceRow[];
  editorOf: BrowseSpaceRow[];
  memberOf: BrowseSpaceRow[];
  /** The viewer's own space, which the sidebar's `memberOf` deliberately leaves out. */
  personalSpaceId: string | null | undefined;
}): Set<string> {
  const allowed = new Set<string>();

  for (const row of featured) allowed.add(normId(row.id));

  // A pending row is a space the viewer has *asked* to join, not one they belong to — the same
  // distinction `useGlobalSearchSpaceIds` draws off these lists.
  for (const row of [...editorOf, ...memberOf]) {
    if (row.pendingLabel) continue;
    allowed.add(normId(row.id));
  }

  if (personalSpaceId) allowed.add(normId(personalSpaceId));

  return allowed;
}

/**
 * The subset of the allowlist the viewer actually belongs to — the spaces they are a member or an
 * editor of, plus their own.
 *
 * The allowlist above is what a viewer may *see*; this is what is theirs. Featured spaces are the
 * difference: they are on offer to everyone, so they widen what can be browsed without saying
 * anything about who the viewer is. GEO-2789 defaults the space filter to this narrower set.
 *
 * Pending rows *are* included, which is the one place this parts company with the allowlist above.
 * The allowlist answers a question about access, where a request that has not been granted plainly
 * isn't one; this answers a question about interest, where it plainly is. A new account expresses
 * that interest at sign-up and spends its first few minutes with every space pending — so excluding
 * them would fall back to "everything" for precisely the viewers this default exists to help, and
 * then quietly start working once the approvals landed.
 *
 * Nothing is granted by being here. The seeded selection is intersected with the spaces the surface
 * already offers, so a pending space the allowlist keeps out stays out; this only decides whether
 * a box starts ticked among the ones already on the menu.
 */
export function buildMemberSpaceIds({
  editorOf,
  memberOf,
  personalSpaceId,
}: {
  editorOf: BrowseSpaceRow[];
  memberOf: BrowseSpaceRow[];
  /** The viewer's own space, which the sidebar's `memberOf` deliberately leaves out. */
  personalSpaceId: string | null | undefined;
}): Set<string> {
  const mine = new Set<string>();

  for (const row of [...editorOf, ...memberOf]) mine.add(normId(row.id));

  if (personalSpaceId) mine.add(normId(personalSpaceId));

  return mine;
}

export function browseSidebarMemberSpaceIds(
  data: BrowseSidebarData,
  personalSpaceId: string | null | undefined
): Set<string> {
  return buildMemberSpaceIds({
    editorOf: data.editorOf,
    memberOf: data.memberOf,
    personalSpaceId: personalSpaceId ?? data.personalSpaceId,
  });
}

export function browseSidebarClaimSpaceAllowlist(
  data: BrowseSidebarData,
  personalSpaceId: string | null | undefined
): Set<string> {
  return buildClaimSpaceAllowlist({
    featured: data.featured,
    editorOf: data.editorOf,
    memberOf: data.memberOf,
    personalSpaceId: personalSpaceId ?? data.personalSpaceId,
  });
}

/**
 * Whether a claim's home space is one the viewer may see claims from.
 *
 * A null allowlist means the sources haven't resolved yet, and every claim passes: filtering
 * against a half-built list would hide claims the viewer is entitled to and then flash them back
 * in, which reads far worse than a beat of everything.
 */
export function isClaimSpaceAllowed(spaceId: string | null | undefined, allowlist: Set<string> | null): boolean {
  if (allowlist === null) return true;
  if (!spaceId) return false;
  return allowlist.has(normId(spaceId));
}

/**
 * The spaces a viewer may see claims from, as a list rather than a membership test.
 *
 * Sent to geo-chat so its rows *and* its facets are scoped to the same spaces the client would
 * otherwise filter down to afterwards. Without it a topic living only in a space this viewer
 * can't see is still offered, and picking it returns rows the client then removes — a menu
 * option that can only ever produce an empty list (GEO-2653).
 *
 * `null` when the allowlist hasn't resolved: there is no list to send, and the gates deliberately
 * pass everything until it does.
 */
export function eligibleClaimSpaceIds(
  allowlist: Set<string> | null,
  spaceShowsClaims: (spaceId: string) => boolean
): string[] | null {
  if (allowlist === null) return null;
  return [...allowlist].filter(spaceShowsClaims);
}

/**
 * The space that should stay selected once the menu has settled around it.
 *
 * Both eligibility gates pass everything while their lookups are unresolved, so a space can be
 * picked out of the menu in that window and then rejected once the answers land. Left selected it
 * keeps going out as `space_id` on every request — with its topic facet — while every row it
 * returns is dropped again locally.
 *
 * `isResolved` is passed rather than inferred from an empty list, for the same reason
 * `keepSelectableTopic` takes it: "the menu hasn't arrived" and "the menu excludes this" look
 * identical from here, and clearing on the first would throw away a selection about to be valid.
 */
export function keepSelectableSpace(
  spaceId: string | null,
  availableSpaceIds: string[],
  isResolved: boolean
): string | null {
  if (spaceId === null || !isResolved) return spaceId;
  return availableSpaceIds.some(id => normId(id) === normId(spaceId)) ? spaceId : null;
}
