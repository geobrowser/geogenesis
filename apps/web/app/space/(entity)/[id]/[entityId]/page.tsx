import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork, isBountyEntity } from '~/core/bounties/config';
import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { getRecordingUrls } from '~/core/community-calls/recordings';
import { WALLET_ADDRESS } from '~/core/cookie';
import { DebateEntityView } from '~/core/debates/browse/debate-entity-view';
import { DebateRemovedView } from '~/core/debates/browse/debate-removed-view';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { debatePageStillPreloads } from '~/core/debates/speaker-still';
import { isHiddenEntity } from '~/core/moderation/hidden';
import { entityBrowseViewFromTypes } from '~/core/utils/entity-browse-view';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';

import { BountyDetailHeader } from '~/partials/bounties/bounty-detail-header';
import { BountyDetailSections } from '~/partials/bounties/bounty-detail-sections';
import { CommunityCallRecording } from '~/partials/community-calls/community-call-recording';

import { cachedFetchDebatePageMedia, cachedFetchEntityPage, cachedReadDebateVisibility } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';
import PostEntityPage from './post-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EntityTemplateStrategy(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) {
    notFound();
  }

  const result = await cachedFetchEntityPage(params.entityId, params.id);

  // Withheld entities serve nothing, before any type branch decides how to render them. A hidden
  // debate previously still rendered its title, video, transcript and comment box here, because
  // hiding only ever reached geo-chat and this page reads the graph (GEO-2809). 404 rather than an
  // explanatory page: the same answer an entity that never existed gets, matching how geo-chat's
  // `ensure_debate_readable` already reports one.
  if (isHiddenEntity(result?.entity)) {
    notFound();
  }

  if (result?.entity && entityBrowseViewFromTypes(result.entity.types) === 'person') {
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  if (entityHasOnlyPostType(result?.entity)) {
    return <PostEntityPage params={params} searchParams={searchParams} />;
  }

  // A Debate is a live video, not a value sheet: browse mode drops you into the debates feed
  // anchored to this debate, and the raw entity page is reserved for edit mode.
  if (isDebateEntity(result?.entity?.types)) {
    // Removal goes through geo-chat only (GEO-2785), so the graph cannot say a debate was removed;
    // geo-chat is asked here, on the server, so a removed debate's video and value sheet never
    // reach the browser — including in edit mode, whose raw entity page carries the video too. An
    // unreachable or ambiguous geo-chat answers `unknown` and the debate renders as before: an
    // outage must not blank every debate. See `fetchDebateVisibility`.
    //
    // The same read's body, and the debate's media readiness fetched beside it, go to the feed so
    // the linked debate can render, on the server too, without its own lookups (GEO-3604).
    const [{ visibility, debate }, media, cookieStore] = await Promise.all([
      cachedReadDebateVisibility(params.entityId),
      cachedFetchDebatePageMedia(params.entityId),
      cookies(),
    ]);
    if (visibility === 'removed') {
      return <DebateRemovedView spaceId={params.id} debateId={params.entityId} />;
    }

    // The linked debate's stills, named in the HTML so they load while the bundle does: they are
    // the first picture of the debate, before any video (GEO-3604). Same hrefs as the card's `<img>`s.
    const stills = debatePageStillPreloads(params.entityId, media?.artifacts);
    // Same-origin in a dev setup that proxies geo-chat, where there is nothing to warm.
    const stillOrigin = stills[0] && URL.canParse(stills[0]) ? new URL(stills[0]).origin : null;

    return (
      <>
        {stillOrigin && <link rel="preconnect" href={stillOrigin} />}
        {stills.map(href => (
          <link key={href} rel="preload" as="image" href={href} fetchPriority="high" />
        ))}
        <DebateEntityView
          spaceId={params.id}
          debateId={params.entityId}
          seed={{ debate, media, signedIn: cookieStore.get(WALLET_ADDRESS) !== undefined }}
          editView={<DefaultEntityPage params={params} searchParams={searchParams} />}
          removedView={<DebateRemovedView spaceId={params.id} debateId={params.entityId} reportOutcome={false} />}
        />
      </>
    );
  }

  // A community call's recording takes the cover slot; its agenda renders below as block content.
  if (result?.entity?.types.some(t => t.id === EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE)) {
    return (
      <DefaultEntityPage
        params={params}
        searchParams={searchParams}
        coverSlot={
          <CommunityCallRecording
            entityId={params.entityId}
            spaceId={params.id}
            serverRecordingUrls={getRecordingUrls(result.entity.relations)}
          />
        }
      />
    );
  }

  // A bounty is an ordinary entity (markdown body, comments, backlinks, edit
  // mode all come from the default page) with its structured facts and
  // curator actions layered into the slots. On a build where bounties are off
  // it degrades to the plain entity page.
  if (bountiesEnabledForNetwork && isBountyEntity(result?.entity?.types)) {
    return (
      <DefaultEntityPage
        params={params}
        searchParams={searchParams}
        notice={<BountyDetailHeader spaceId={params.id} bountyId={params.entityId} />}
        belowBodySlot={<BountyDetailSections spaceId={params.id} bountyId={params.entityId} />}
        // The facts card covers the bounty's structured properties, in read and edit mode alike.
        hideProperties
      />
    );
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
