'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { profileLinks } from '~/core/profile/profile-links';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';

import { PersonalSpaceHeadline, PersonalSpaceProfile } from './personal-space-profile';
import { ProfileRailSections } from './profile-rail';

/**
 * A person's profile, on the two surfaces that are not their space's home page.
 *
 * The profile was built as a *route*: `/space/<personal space>` assembles it out
 * of three pieces that live in three places — the header and tabs in the space
 * layout, the rail beside it, and the sections in the page body. Anything
 * arriving at the same person by another door got none of it. Clicking a
 * participant in a debate opens the side panel on exactly the pair that route
 * uses — the person entity, in their personal space — and got the generic value
 * sheet, as did the full-page entity route at `/space/<id>/<entity id>`, which
 * sits in its own `(entity)` group and so shares neither the layout nor the rail.
 *
 * Dispatched through `useCustomBrowseView`, the same switch that gives a claim
 * and a topic their own read views. That is what makes this one component serve
 * both surfaces: they both render through `EntityPageBody`.
 *
 * **The rail is folded into the column here**, which the space route does not do
 * because it has a rail to put it in. Neither of these surfaces does, and the
 * facts in it — the spaces this person works in, their links, the three counts —
 * are most of what a profile *says*. The About tab already renders this same set
 * in the main column for the same reason, below the width where the rail drops.
 */
export function PersonProfileView({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { space } = useSpace(spaceId);

  const links = React.useMemo(
    () =>
      profileLinks(
        (space?.entity?.values ?? []).map(value => ({ property: { id: value.property.id }, value: value.value }))
      ),
    [space?.entity?.values]
  );

  const types = React.useMemo(
    () => (space?.entity?.types ?? []).map(type => ({ id: type.id, name: type.name ?? null })),
    [space?.entity?.types]
  );

  return (
    <div className="flex flex-col">
      {/* The roles line that sits under the name in the space header, which
          neither of these surfaces draws. Without it the panel opens on a name
          and nothing that says who it belongs to. */}
      <PersonalSpaceHeadline spaceId={spaceId} personEntityId={entityId} />

      <Spacer height={24} />

      <PersonalSpaceProfile spaceId={spaceId} personEntityId={entityId} />

      <Spacer height={40} />

      <ProfileRailSections
        spaceId={spaceId}
        personEntityId={entityId}
        types={types}
        links={links}
        systemEntityId={space?.entity?.id ?? spaceId}
        address={space?.address ?? null}
        spaceType={space?.type ?? 'PERSONAL'}
      />

      <Spacer height={40} />

      {/* Whatever this person wrote on their own page, as the space route shows
          it. */}
      <Editor spaceId={spaceId} shouldHandleOwnSpacing />

      <Spacer height={40} />

      {/*
       * No properties sheet, matching the space route: every property it would
       * list is already above in a form a reader understands — the types and
       * links in the rail section, the history in its own cards — and the raw
       * table says the same things again in the graph's vocabulary rather than a
       * person's.
       */}
      {/*
       * The *client* container, not the server one. This is a client component,
       * so React re-invokes an async server component on every render — which is
       * how one entity page came to send `EntityBacklinksPage` 82 times
       * (GEO-2666). `EntityPageBody` takes the same care two files over.
       */}
      <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
        <BacklinksClientContainer entityId={entityId} />
      </TrackedErrorBoundary>
    </div>
  );
}
