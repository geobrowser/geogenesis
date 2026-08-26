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
