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
    /*
     * Narrow only, matching the tab that leads here.
     *
     * `StickySideRail` is `lg:hidden` — desktop-first breakpoints, so it shows
     * at 1024px and up — and the tab carries `onlyWhenNarrow`, which is its
     * mirror image. The route had no gate at all, so opening `/about` directly
     * on a desktop, or widening the viewport while on it, drew these sections
     * twice: once here and once in the rail beside them.
     *
     * Hidden rather than redirected because the decision is a viewport width,
     * which the server rendering this route cannot see. On a desktop the main
     * column is empty and the rail carries the facts, which is where a desktop
     * reader was going to look for them anyway.
     */
    <div className="hidden lg:block">
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
    </div>
  );
}
