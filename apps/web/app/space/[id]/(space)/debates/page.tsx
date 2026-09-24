import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { requestsHiddenProfileDebates } from '~/core/profile/profile-debate-visibility';
import { Spaces } from '~/core/utils/space';

import { PersonDebatesTab } from '~/partials/profile/person-debates-tab';

import { cachedFetchSpace } from '../../cached-fetch-space';
import { DebatesPageClient } from './debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hidden?: string | string[] }>;
}

export default async function DebatesPage(props: Props) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  // A profile shows the person's own debates as cards, inside the profile. Not
  // the full-screen player: this is a record being read beside the rest of a
  // profile, and the player takes the page over.
  //
  // The same predicate the layout branches on, not `type === 'PERSONAL'`. A
  // personal space with no person on it gets no profile chrome and no rail, so
  // the cards would render into a bare page — the feed below is the right
  // fallthrough for it.
  if (Spaces.isPersonProfileSpace(space)) {
    // The layout supplies the column and the rail; `pb-16` because `Main` drops
    // its own padding on this route — see `SpaceChromeGate`, which puts the top
    // half back above the header.
    return (
      <div className="pb-16">
        <PersonDebatesTab spaceId={params.id} showHiddenInitially={requestsHiddenProfileDebates(searchParams.hidden)} />
      </div>
    );
  }

  // Full-bleed: no content-width container. The feed fills the viewport itself.
  return <DebatesPageClient spaceId={params.id} />;
}
