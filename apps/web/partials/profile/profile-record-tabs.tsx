'use client';

import * as React from 'react';

import cx from 'classnames';

import { useProfileFacts } from '~/core/hooks/use-profile-facts';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useSpace } from '~/core/hooks/use-space';
import { profileLinks } from '~/core/profile/profile-links';
import { heldPositionsCount, usePersonResponses } from '~/core/profile/use-person-positions';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import type { Profile } from '~/core/types';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

import { Editor } from '~/partials/editor/editor';
import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';

import { PersonDebatesTab } from './person-debates-tab';
import { PersonPositionsTab } from './person-positions-tab';
import { PersonProposalsTab } from './person-proposals-tab';
import { PersonalSpaceProfile } from './personal-space-profile';
import { ProfileRailSections } from './profile-rail';

type RecordTab = 'overview' | 'debates' | 'positions' | 'proposals' | 'about';

/**
 * The profile's own tabs, switched in place rather than navigated (GEO-2969).
 *
 * The space route spends four *routes* on these, which is right there: each is a
 * page with its own URL, and the rail stays put beside them. Neither surface
 * this renders on can do that — a side panel that navigated would close itself
 * to show you what you clicked, and the `(entity)` route has no layout to keep
 * the header still. So the same four lists live behind local state here.
 *
 * **About is the rail.** Below 1024px `StickySideRail` drops itself and the
 * space route grows an About tab carrying exactly this set; the panel is always
 * narrower than that, so it always has one. That is the same reasoning by which
 * the mobile layout is the right model for a panel generally: both are a single
 * column too narrow for a rail.
 *
 * Counts hide what they empty, matching `buildSpaceTabs` — most people have
 * never opened a proposal, and a tab leading to "No proposals yet" is a promise
 * the profile cannot keep. Unknown counts show everything, since hiding a tab
 * holding hundreds of rows is the one outcome worse than showing an empty one.
 */
export function ProfileRecordTabs({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const [tab, setTab] = React.useState<RecordTab>('overview');

  const {
    facts,
    isLoading: isLoadingFacts,
    isError: isFactsError,
  } = useProfileFacts({
    spaceId,
    personEntityId: entityId,
  });

  // The rail's own source, so the count that decides whether Positions is
  // offered is the count that tab would show — a retracted vote is not a
  // position, and `entitiesConnection(votedBy:)` counts it as one.
  const responses = usePersonResponses({ spaceId });
  const positions = heldPositionsCount(responses, facts.positions);

  const isCountKnown = !isLoadingFacts && !isFactsError;
  const has = React.useCallback((count: number | null) => !isCountKnown || count === null || count > 0, [isCountKnown]);

  const tabs = React.useMemo(() => {
    const all: { id: RecordTab; label: string; shown: boolean }[] = [
      { id: 'overview', label: 'Overview', shown: true },
      { id: 'debates', label: 'Debates', shown: has(facts.debates) },
      { id: 'positions', label: 'Positions', shown: has(positions) },
      { id: 'proposals', label: 'Proposals', shown: has(facts.proposals) },
      // Always: it is the rail, and neither surface has one.
      { id: 'about', label: 'About', shown: true },
    ];

    return all.filter(entry => entry.shown);
  }, [facts.debates, facts.proposals, has, positions]);

  // A tab that stops being offered while it is open — its count arrived as zero
  // — would leave the reader on a list nothing points at.
  React.useEffect(() => {
    if (!tabs.some(entry => entry.id === tab)) setTab('overview');
  }, [tab, tabs]);

  return (
    <div className="flex flex-col">
      <div className="no-scrollbar -mx-1 flex items-center gap-4 overflow-x-auto border-b border-divider px-1">
        {tabs.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? 'page' : undefined}
            className={cx(tabGroupTabLinkStyles({ active: tab === entry.id }), 'shrink-0 pb-2')}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <Spacer height={24} />

      <TabPanel tab={tab} entityId={entityId} spaceId={spaceId} />
    </div>
  );
}

function TabPanel({ tab, entityId, spaceId }: { tab: RecordTab; entityId: string; spaceId: string }) {
  if (tab === 'debates') return <PersonDebatesTab spaceId={spaceId} />;
  if (tab === 'positions') return <PersonPositionsTab spaceId={spaceId} />;
  if (tab === 'proposals') return <ProposalsPanel spaceId={spaceId} />;
  if (tab === 'about') return <AboutPanel entityId={entityId} spaceId={spaceId} />;

  return <OverviewPanel entityId={entityId} spaceId={spaceId} />;
}

/** What the space route's Overview shows: the record sections, then their page. */
function OverviewPanel({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  return (
    <>
      <PersonalSpaceProfile spaceId={spaceId} personEntityId={entityId} />

      <Spacer height={40} />

      <Editor spaceId={spaceId} shouldHandleOwnSpacing />

      <Spacer height={40} />

      {/*
       * The *client* container, not the server one: this is a client component,
       * so React re-invokes an async server component on every render — one
       * entity page once sent `EntityBacklinksPage` 82 times that way (GEO-2666).
       */}
      <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
        <BacklinksClientContainer entityId={entityId} />
      </TrackedErrorBoundary>
    </>
  );
}

/** The rail's cards, in the column — which is what the About route renders too. */
function AboutPanel({ entityId, spaceId }: { entityId: string; spaceId: string }) {
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
    <ProfileRailSections
      spaceId={spaceId}
      personEntityId={entityId}
      types={types}
      links={links}
      systemEntityId={space?.entity?.id ?? spaceId}
      address={space?.address ?? null}
      spaceType={space?.type ?? 'PERSONAL'}
    />
  );
}

/**
 * Proposals, which needs a proposer the route resolves server-side.
 *
 * Every row was proposed by the same person — the one whose profile this is — so
 * the byline is looked up once here rather than per row, as the route does.
 */
function ProposalsPanel({ spaceId }: { spaceId: string }) {
  const spaceIds = React.useMemo(() => [spaceId], [spaceId]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds);

  const proposer: Profile = React.useMemo(
    () =>
      profilesBySpaceId.get(spaceId) ?? {
        // Someone the graph has no profile row for yet. The rows still render,
        // unnamed — the same fallback the route makes.
        id: spaceId,
        spaceId,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: spaceId as `0x${string}`,
        profileLink: null,
      },
    [profilesBySpaceId, spaceId]
  );

  return <PersonProposalsTab spaceId={spaceId} proposer={proposer} />;
}
