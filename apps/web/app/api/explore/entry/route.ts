import { NextResponse } from 'next/server';

import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { debateHasProcessedVideo, exploreBrowseSpaceIds, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { leadWithPlayableDebate } from '~/core/explore/lead-with-playable-debate';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { normId } from '~/core/utils/norm-id';

/** An explicit marketing selection, independent of ranking, paging and seen demotion. */
export async function GET(request: Request) {
  const id = normId(new URL(request.url).searchParams.get('entityId') ?? '');
  const headers = { 'cache-control': 'private, no-store' };
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ item: null }, { status: 400, headers });
  try {
    const context = await resolveExploreFeedRequestContext();
    const spaceIds = exploreBrowseSpaceIds(context.browse, null);
    const result = await fetchExploreFeed({
      ...context,
      sort: 'new',
      time: 'all',
      cursor: null,
      spaceFilterIds: null,
      viewerMemberSpaceId: context.personalMemberSpaceId,
      entityFilter: {
        or: [
          { id: { is: id } },
          {
            typeIds: { overlaps: [DEBATE_TYPE_ID] },
            relations: {
              some: {
                typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
                toEntityId: { is: id },
                spaceId: { in: spaceIds },
              },
            },
          },
        ],
      },
    });
    // Claim cards lead with a playable debate about that claim, with the claim itself as fallback.
    const playable: typeof result.items = [];
    await leadWithPlayableDebate(result.items, {
      isDebate: item => isDebateEntity(item.types),
      isPlayable: (item, signal) => debateHasProcessedVideo(item.entityId, signal),
      onPlayable: items => playable.push(...items),
    });
    const item =
      playable.find(item => normId(item.entityId) === id) ??
      playable[0] ??
      result.items.find(item => normId(item.entityId) === id) ??
      null;
    return NextResponse.json({ item }, { headers });
  } catch (error) {
    console.error('explore entry', error);
    return NextResponse.json({ item: null }, { status: 503, headers });
  }
}
