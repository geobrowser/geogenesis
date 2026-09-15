import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { profileLinks } from '~/core/profile/profile-links';
import { Spaces } from '~/core/utils/space';

import { ProfileRailSections } from '~/partials/profile/profile-rail';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The rail's facts, as a tab (GEO-2859).
 *
 * `StickySideRail` drops itself below 1024px — a rail narrower than 280px stops
 * being readable — so on a phone the spaces, links and counts have nowhere to
 * go at all. This is the same `ProfileRailSections` the rail renders, in the
 * main column, reached by a tab that is itself hidden at the widths where the
 * rail is showing.
 */
export default async function AboutPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  if (!space || !Spaces.isPersonProfileSpace(space)) {
    notFound();
  }

  return (
    <ProfileRailSections
      spaceId={space.id}
      personEntityId={space.entity.id}
      types={(space.entity.types ?? []).map(type => ({ id: type.id, name: type.name ?? null }))}
      links={profileLinks(
        (space.entity.values ?? []).map(value => ({ property: { id: value.property.id }, value: value.value }))
      )}
      systemEntityId={space.entity.id}
      address={space.address ?? null}
      spaceType={space.type}
    />
  );
}
