import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { notFound, redirect } from 'next/navigation';

import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { cachedFetchSpace } from '../../cached-fetch-space';
import { generateSpaceMetadata } from '../space-metadata';
import { SpaceOverviewBody } from '../space-overview-body';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return generateSpaceMetadata((await props.params).id);
}

/**
 * A topic space's own page, which its bare URL gives up to the Explore feed.
 *
 * Only a topic space has one. Anywhere else this is the bare URL under a second name, so it goes
 * there instead of becoming a duplicate that the tab bar would never mark as active.
 */
export default async function SpaceOverviewPage(props: Props) {
  const { id: spaceId } = await props.params;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const space = await cachedFetchSpace(spaceId);

  if (!Spaces.isTopicHomeSpace(space)) {
    redirect(NavUtils.toSpace(spaceId));
  }

  return <SpaceOverviewBody space={space} spaceId={spaceId} tabId={undefined} />;
}
