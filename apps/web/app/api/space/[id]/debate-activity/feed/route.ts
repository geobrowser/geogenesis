import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type ExploreSort, type ExploreTime, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { SPACE_ACTIVITY_TYPE_ID, parseSpaceActivityKindFromTypeIds } from '~/core/space/space-debate-activity';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

const SORTS: ExploreSort[] = ['new', 'top', 'best'];
const TIMES: ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

/** Best by default — this feed is a "what is worth reading here" view, not a change log. */
function parseSort(raw: string | null): ExploreSort {
  if (raw && (SORTS as string[]).includes(raw)) return raw as ExploreSort;
  return 'best';
}

/** See the explore route: an unrecognised or absent range means no range, never a guessed week. */
function parseTime(raw: string | null): ExploreTime {
  if (raw && (TIMES as string[]).includes(raw)) return raw as ExploreTime;
  return 'all';
}

/**
 * A space's debates or its debatable claims, as an Explore feed pinned to that space.
 *
 * ## Why this is not `/api/explore/feed?spaceIds=<id>`
 *
 * That route narrows the requested spaces to the ones the *reader* can already see — featured,
 * plus their own member and editor spaces — and when nothing survives that intersection it drops
 * the filter entirely and serves the unfiltered feed. For Explore that is the right call: a filter
 * naming only spaces the reader cannot see has no honest answer, and an empty feed is the wrong
 * one. Here it would be a correctness bug. This feed is reached from one space's Overview and has
 * to show that space's entities and nothing else, so a reader who is not a member of it — the
 * common case for a space someone has just been linked to — would otherwise be shown a cross-space
 * feed under a "See all debates" they pressed inside one space.
 *
 * So the space is pinned from the route parameter and the browse payload is synthesized around it,
 * exactly as the space activity feed does. `fetchExploreFeed` builds its allowed-space set from
 * that payload, so one row in it is a hard scope rather than a request that can be widened.
 *
 * ## Types
 *
 * One type per request — `Debate` or `Claim`. It arrives as `typeIds`, which is what every
 * `EntityFeed` sends, but anything other than exactly one of those two is rejected rather than
 * passed through: a space-scoped reader for arbitrary types is a different endpoint from this one.
 * A single type is also the shape Best is fastest at — `fetchExploreFeed` routes a one-type Best
 * through `entitiesRankedForFeedByTypeConnection` and skips the diversity window, which has
 * nothing to diversify against here.
 *
 * Claims carry Explore's own restriction (GEO-2835): a claim appears only if a curator tagged it
 * `Debate`. That is what makes this "debate activity" rather than "every claim in the space", and
 * it is the same gate the counts beside the feed are measured through — see
 * `SPACE_DEBATE_ACTIVITY_COUNTS_QUERY` for why the two have to agree.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: spaceId } = await params;
  const { searchParams } = new URL(request.url);
  const kind = parseSpaceActivityKindFromTypeIds(searchParams.get('typeIds'));

  if (!IdUtils.isValid(spaceId)) {
    return NextResponse.json({ error: 'invalid space id' }, { status: 400 });
  }

  if (!kind) {
    return NextResponse.json({ error: 'typeIds must name exactly one of Debate or Claim' }, { status: 400 });
  }

  const sort = parseSort(searchParams.get('sort'));
  const time = parseTime(searchParams.get('time'));
  const cursor = searchParams.get('cursor');

  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  // Only for the card's own "you are a member here" affordances; it never widens the space scope.
  let memberOrEditorSpaceIds: string[] = [];
  if (cookieWallet) {
    const personalMemberSpaceId = await resolveMemberSpaceFromWalletSafe(cookieWallet);
    if (personalMemberSpaceId) {
      try {
        const ctx = await getGovernanceHomeSpaceContext(personalMemberSpaceId);
        memberOrEditorSpaceIds = [...new Set([...ctx.editorIds, ...ctx.myProposalSpaceIds, personalMemberSpaceId])];
      } catch {
        memberOrEditorSpaceIds = [personalMemberSpaceId];
      }
    }
  }

  // One row, so the feed's allowed-space set is exactly this space. The name is left empty on
  // purpose: the feed pins the space and hides the space link, and the Overview card resolves real
  // names through `useSpaceLabels` rather than from here.
  const browse: BrowseSidebarData = {
    featured: [{ id: spaceId, name: '', image: null }],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };

  try {
    const result = await fetchExploreFeed({
      browse,
      sort,
      time,
      spaceFilterIds: [spaceId],
      cursor,
      walletAddress: cookieWallet ?? null,
      memberOrEditorSpaceIds,
      typeIds: [SPACE_ACTIVITY_TYPE_ID[kind]],
      requireName: true,
      requireDebateTagOnClaims: true,
      // The tag gate removes most of what the ranking returns for claims, and the exact candidate
      // budget then serves a short first page that the connection reports as the end of the feed —
      // measured, 18 rows of a 30-row page and no cursor, against a space holding hundreds. This
      // feed is meant to scroll, so it pays for the wider candidate window. See
      // `fetchBestEntitiesByTypePage`.
      widenBestCandidateBudget: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('space debate-activity feed', e);
    // Degraded rather than a 500: the surfaces reading this render an empty feed, which is a state
    // a reader can understand, where a throw takes the page with it.
    return NextResponse.json({ items: [], nextCursor: null });
  }
}
