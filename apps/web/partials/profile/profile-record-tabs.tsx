'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';

import { useProfileFacts } from '~/core/hooks/use-profile-facts';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useSpace } from '~/core/hooks/use-space';
import { fallbackProposer, hasRecordToShow } from '~/core/profile/profile-proposer';
import { profileRailFacts } from '~/core/profile/profile-rail-facts';
import { heldPositionsCount, usePersonResponses } from '~/core/profile/use-person-positions';
import type { Profile } from '~/core/types';

import { Spacer } from '~/design-system/spacer';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

import { Editor } from '~/partials/editor/editor';
import { EntityBacklinks } from '~/partials/entity-page/entity-backlinks';

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
export function ProfileRecordTabs({
  entityId,
  spaceId,
  authoredTabs,
}: {
  entityId: string;
  spaceId: string;
  /** See `PersonProfileView`. Rendered inside Overview, above this person's page. */
  authoredTabs?: React.ReactNode;
}) {
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

  // Unknown counts offer every tab, which `hasRecordToShow` is the statement of
  // — so a read that is still out or has failed is passed through as unknown
  // rather than folded into a second rule here.
  const isCountKnown = !isLoadingFacts && !isFactsError;
  const has = React.useCallback(
    (count: number | null) => hasRecordToShow(isCountKnown ? count : undefined),
    [isCountKnown]
  );

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
            className={cx(tabGroupTabLinkStyles({ active: tab === entry.id }), 'relative shrink-0 pb-2')}
          >
            {entry.label}
            {/*
             * The underline is not decoration here, it is the only thing that
             * says which tab is open: `tabGroupTabLinkStyles` gives an inactive
             * tab `hover:text-text`, which is exactly the active colour, so
             * hovering one made it indistinguishable from the open one.
             *
             * Same `layoutId` as `TabGroup`, so it slides between tabs the way
             * the route's bar does rather than cutting.
             */}
            {tab === entry.id && (
              <motion.div
                layoutId="profile-record-tabs-active-border"
                layout
                initial={false}
                transition={{ duration: 0.2 }}
                className="absolute right-0 bottom-[-1px] left-0 h-px bg-text"
              />
            )}
          </button>
        ))}
      </div>

      <Spacer height={24} />

      <TabPanel tab={tab} entityId={entityId} spaceId={spaceId} authoredTabs={authoredTabs} />
    </div>
  );
}

function TabPanel({
  tab,
  entityId,
  spaceId,
  authoredTabs,
}: {
  tab: RecordTab;
  entityId: string;
  spaceId: string;
  authoredTabs?: React.ReactNode;
}) {
  if (tab === 'debates') return <PersonDebatesTab spaceId={spaceId} />;
  if (tab === 'positions') return <PersonPositionsTab spaceId={spaceId} />;
  if (tab === 'proposals') return <ProposalsPanel spaceId={spaceId} />;
  if (tab === 'about') return <AboutPanel entityId={entityId} spaceId={spaceId} />;

  return <OverviewPanel entityId={entityId} spaceId={spaceId} authoredTabs={authoredTabs} />;
}

/** What the space route's Overview shows: the record sections, then their page. */
function OverviewPanel({
  entityId,
  spaceId,
  authoredTabs,
}: {
  entityId: string;
  spaceId: string;
  authoredTabs?: React.ReactNode;
}) {
  return (
    <>
      <PersonalSpaceProfile spaceId={spaceId} personEntityId={entityId} />

      <Spacer height={40} />

      {/* This person's own tabs, which select what the editor below renders —
          the same pairing the space route makes, minus its header. Renders
          nothing for somebody who has authored none. */}
      {authoredTabs}

      <Editor spaceId={spaceId} shouldHandleOwnSpacing />

      <Spacer height={40} />

      <EntityBacklinks entityId={entityId} />
    </>
  );
}

/** The rail's cards, in the column — which is what the About route renders too. */
function AboutPanel({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { space } = useSpace(spaceId);
  const facts = React.useMemo(() => profileRailFacts(space, spaceId), [space, spaceId]);

  return <ProfileRailSections spaceId={spaceId} personEntityId={entityId} {...facts} />;
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
    () => profilesBySpaceId.get(spaceId) ?? fallbackProposer(spaceId),
    [profilesBySpaceId, spaceId]
  );

  return <PersonProposalsTab spaceId={spaceId} proposer={proposer} />;
}
