import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';
import { BOUNTY_TYPE_ID } from '~/core/bounties/ontology';
import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { getRecordingUrls } from '~/core/community-calls/recordings';
import { DebateEntityView } from '~/core/debates/browse/debate-entity-view';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';

import { BountyDetailHeader } from '~/partials/bounties/bounty-detail-header';
import { BountyDetailSections } from '~/partials/bounties/bounty-detail-sections';
import { CommunityCallRecording } from '~/partials/community-calls/community-call-recording';

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

  if (result?.entity?.types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  if (entityHasOnlyPostType(result?.entity)) {
    return <PostEntityPage params={params} searchParams={searchParams} />;
  }

  // A Debate is a live video, not a value sheet: browse mode drops you into the debates feed
  // anchored to this debate, and the raw entity page is reserved for edit mode.
  if (result?.entity?.types.some(t => t.id === DEBATE_TYPE_ID)) {
    return (
      <DebateEntityView
        spaceId={params.id}
        debateId={params.entityId}
        editView={<DefaultEntityPage params={params} searchParams={searchParams} />}
      />
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
  if (bountiesEnabledForNetwork && result?.entity?.types.some(t => t.id === BOUNTY_TYPE_ID)) {
    return (
      <DefaultEntityPage
        params={params}
        searchParams={searchParams}
        notice={<BountyDetailHeader spaceId={params.id} bountyId={params.entityId} />}
        belowBodySlot={<BountyDetailSections spaceId={params.id} bountyId={params.entityId} />}
      />
    );
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
