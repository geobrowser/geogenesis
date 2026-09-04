import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import {
  type RequestedMembershipSpace,
  activeRequestedSpacesForOwner,
  requestedMembershipIdSet,
} from '~/core/state/requested-membership';
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
  // The viewer's own spaces plus what is on offer to everyone — said that way round, so the two
  // sets cannot drift. `buildMemberSpaceIds` is the same list the space filter defaults to, and a
  // space that counts as theirs there has to be one they may see here.
  const allowed = buildMemberSpaceIds({ editorOf, memberOf, personalSpaceId });

  for (const row of featured) allowed.add(normId(row.id));

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
 * Pending rows count. A viewer who has asked to join a space is telling us it is one of theirs,
 * and sign-up collects exactly that before any approval exists — so a new account spends its first
 * minutes with every space pending. Excluding them left that account looking at a panel with none
 * of the spaces it had just chosen, which then filled in on its own once the approvals landed.
 * Approval changes nothing here, which is the point: nothing should lurch when it arrives.
 *
 * Wider than the same distinction `useGlobalSearchSpaceIds` draws off these lists, deliberately —
 * that one is picking where to search, this one is deciding whether a space is the viewer's at all.
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

/**
 * How long a request is treated as still settling.
 *
 * Deliberately much shorter than `REQUEST_BRIDGE_TTL_MS`, which the bridge needs for a different
 * job: keeping a "Membership pending" label up until the server can be trusted to contradict it.
 * This bounds two things that must not run for five minutes — how long the sidebar payload is
 * re-asked for, and how long the space filter holds its default waiting for one more answer.
 *
 * Sized on the observed gap, which is tens of seconds. A request still missing after this either
 * failed or was rejected — `fetchPendingMembershipSpaceIds` drops a vote-ended proposal outright,
 * so it can *never* arrive — and continuing to wait costs a full sidebar payload every tick while
 * the filter stays open on nothing.
 */
export const REQUESTED_MEMBERSHIP_SETTLE_MS = 90_000;

/**
 * Whether this payload still owes the viewer a membership request they have already made.
 *
 * The gap it measures is real and about a minute wide: the request reaches the chain when the
 * transaction does and the indexer some time after, so a payload fetched in between is a correct
 * answer to a question that has since changed. Everything reading these lists — the space filter's
 * default among it — was left on the pre-request answer until something happened to refetch, which
 * in practice meant a hard refresh (GEO-2815).
 *
 * The optimistic bridge is the only thing that knows a request was made before the server does, so
 * it is what says whether waiting is worth it — it decides *when to re-ask*, never what the answer
 * is. Two things stop the wait: the request appearing here, and
 * {@link REQUESTED_MEMBERSHIP_SETTLE_MS} passing, which is what retires one that never lands.
 *
 * No data yet is treated as owing: there is a live request and nothing to say it has arrived.
 */
export function awaitsRequestedMembership({
  requestedSpaces,
  personalSpaceId,
  walletAddress,
  data,
  now,
}: {
  requestedSpaces: RequestedMembershipSpace[];
  personalSpaceId: string | null | undefined;
  walletAddress: string | null | undefined;
  data: BrowseSidebarData | undefined;
  now: number;
}): boolean {
  // Nothing to wait for until the viewer has a personal space. Membership is proposed *by* that
  // space, so the sources behind this payload cannot report a request before it exists — and
  // onboarding seeds bridge entries under the wallet address minutes earlier, while its own
  // requests are still queued behind the space being created. Polling on those re-asks a question
  // that has no answer yet, for the whole of signup, and on that branch the query is a *server
  // action* (`loadBrowseSidebarData`) rather than a plain fetch.
  if (!personalSpaceId) return false;

  const settling = activeRequestedSpacesForOwner(requestedSpaces, personalSpaceId, now, walletAddress).filter(
    space => now - space.requestedAt < REQUESTED_MEMBERSHIP_SETTLE_MS
  );

  const requested = requestedMembershipIdSet(settling);
  if (requested.size === 0) return false;
  if (!data) return true;

  const answered = browseSidebarMemberSpaceIds(data, personalSpaceId);
  return [...requested].some(id => !answered.has(id));
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
