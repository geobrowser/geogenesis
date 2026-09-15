import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork, isBountyEntity } from '~/core/bounties/config';
import { DebateEntityView } from '~/core/debates/browse/debate-entity-view';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { isHiddenEntity } from '~/core/moderation/hidden';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';

import { BountyDetailHeader } from '~/partials/bounties/bounty-detail-header';
import { BountyDetailSections } from '~/partials/bounties/bounty-detail-sections';

import { cachedFetchEntityPage } from './cached-fetch-entity';
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

  if (result?.entity?.types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  if (entityHasOnlyPostType(result?.entity)) {
    return <PostEntityPage params={params} searchParams={searchParams} />;
  }

  // A Debate is a live video, not a value sheet: browse mode drops you into the debates feed
  // anchored to this debate, and the raw entity page is reserved for edit mode.
  if (isDebateEntity(result?.entity?.types)) {
    return (
      <DebateEntityView
        spaceId={params.id}
        debateId={params.entityId}
        editView={<DefaultEntityPage params={params} searchParams={searchParams} />}
      />
    );
  }

  // A community call event has its own read view — see `CommunityCallEventPageView`, reached
  // through `useCustomBrowseView` rather than from here so the entity side panel gets it too.
  // It draws the recording itself, so there is no cover slot to set: doing both rendered the
  // player twice. Edit mode still falls through to the value sheet, as it does for every custom
  // view, which means an editor sees the `Recordings` relation rather than a player.

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
