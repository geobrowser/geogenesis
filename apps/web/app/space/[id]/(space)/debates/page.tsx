import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { PersonDebatesTab } from '~/partials/profile/person-debates-tab';

import { cachedFetchSpace } from '../../cached-fetch-space';
import { DebatesPageClient } from './debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebatesPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  // A personal space shows the person's own debates as cards, inside the
  // profile. Not the full-screen player: this is a record being read beside the
  // rest of a profile, and the player takes the page over.
  if (space?.type === 'PERSONAL') {
    // The layout supplies the column and the rail; `pb-16` because `Main` drops
    // its own padding on this route — see `SpaceChromeGate`, which puts the top
    // half back above the header.
    return (
      <div className="pb-16">
        <PersonDebatesTab spaceId={params.id} />
      </div>
    );
  }

  // Full-bleed: no content-width container. The feed fills the viewport itself.
  return <DebatesPageClient spaceId={params.id} />;
}
