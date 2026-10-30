'use client';

import * as React from 'react';

import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { DebateClaimCardSurface, sectionStartOffsets, useRecordClaimFilter } from '../debate-claim-card-surface';
import { useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { CollapsibleClaimSection } from '../matchmaking/collapsible-claim-section';
import { FacetFilterPills, type FacetPillOption } from '../matchmaking/facet-filter-pills';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubCardList } from '../matchmaking/hub-motion';
import { HubQueryState } from '../matchmaking/hub-states';
import {
  claimRowGroups,
  placedAnswersReady,
  placedClaimKey,
  rowsByPlacedClaim,
  taggedClaimEntry,
} from '../matchmaking/tagged-claim-entry';
import {
  carriesEveryTopic,
  countBy,
  hasId,
  inEverySpace,
  keepSelectedVisible,
  narrowingOptions,
  orderFacetOptions,
  toggleId,
} from '../matchmaking/topic-facets';
import { useTodaysSectionsOpen } from '../todays-claims/section-open-state';
import { type TodaysListClaim, useTodaysClaimsList } from '../todays-claims/todays-claims-list';
import { useLobbyRoomCardRenderer } from './lobby-explore-claims';
import { exploreRoomClaimBatches } from './lobby-explore-claims-hooks';
import type { LobbyPageView } from './lobby-view';

export const TODAYS_CLAIMS_TAB_COPY = {
  empty: 'No agendas today yet.',
  noMatch: 'No claims match these filters.',
};

const LIST_ID = 'todays_claims_lobby';

/**
 * A lobby's "Today's claims" tab (GEO-3491): every space's newest Debate agenda, the lobby's own space
 * first when it has one, under the agendas' section headings. The same single row of space and topic
 * pills as the debate-again picker (AND, each counted by what picking it would leave), and the same
 * collapsible sections, each holding the cards the lobby's other lists draw.
 */
export function LobbyTodaysClaimsTab({ lobby }: { lobby: LobbyPageView }) {
  const { sections, newestDay, isLoading, error } = useTodaysClaimsList({
    leadSpaceId: lobby.call?.space_id ?? null,
  });
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  const recordFilter = useRecordClaimFilter('debate_matchmaking');
  const sectionsOpen = useTodaysSectionsOpen(newestDay);

  const passes = React.useCallback(
    (claim: TodaysListClaim) => inEverySpace(spaceIds, claim.spaceId) && carriesEveryTopic(claim.topics, topicIds),
    [spaceIds, topicIds]
  );
  const visibleSections = React.useMemo(
    () =>
      sections
        .map(section => ({ ...section, claims: section.claims.filter(passes) }))
        .filter(section => section.claims.length > 0),
    [passes, sections]
  );

  // Co-occurrence over the claims left by every pick, so a pill's count is what picking it leaves.
  const narrowed = React.useMemo(() => visibleSections.flatMap(section => section.claims), [visibleSections]);
  const allSpaceIds = React.useMemo(
    () => [...new Set(sections.flatMap(section => section.claims.map(claim => claim.spaceId)))],
    [sections]
  );
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(allSpaceIds);
  const pillOptions = React.useMemo<FacetPillOption[]>(() => {
    const total = narrowed.length;
    const spaces = narrowingOptions(
      keepSelectedVisible(countBy(narrowed.map(claim => ({ id: claim.spaceId, name: null }))), spaceIds),
      total,
      spaceIds
    ).map(space => {
      const label = spaceLabel(labelsById, space.id);
      return {
        kind: 'space' as const,
        id: space.id,
        name: label?.name ?? (labelsLoading ? null : 'Space'),
        image: label?.image ?? null,
        count: space.count,
      };
    });
    const topics = narrowingOptions(
      keepSelectedVisible(countBy(narrowed.flatMap(claim => claim.topics)), topicIds),
      total,
      topicIds
    ).map(topic => ({ kind: 'topic' as const, id: topic.id, name: topic.name ?? 'Topic', count: topic.count }));
    return [...orderFacetOptions(spaces, spaceIds), ...orderFacetOptions(topics, topicIds)];
  }, [labelsById, labelsLoading, narrowed, spaceIds, topicIds]);
  const pickedIds = React.useMemo(() => [...spaceIds, ...topicIds], [spaceIds, topicIds]);
  const filtered = pickedIds.length > 0;

  return (
    <div className="flex flex-col gap-3" data-testid="lobby-todays-claims-tab">
      {pillOptions.length > 0 ? (
        <FacetFilterPills
          analyticsSurface="hub"
          options={pillOptions}
          pickedIds={pickedIds}
          onToggle={option => {
            const picks = option.kind === 'space' ? spaceIds : topicIds;
            recordFilter(LIST_ID, { kind: option.kind, value: option.id, selected: !hasId(picks, option.id) });
            if (option.kind === 'space') setSpaceIds(current => toggleId(current, option.id));
            else setTopicIds(current => toggleId(current, option.id));
          }}
          onClear={() => {
            recordFilter(LIST_ID, { kind: 'filters', value: 'all' });
            setSpaceIds([]);
            setTopicIds([]);
          }}
        />
      ) : null}
      <HubQueryState
        analyticsSurface="hub"
        isLoading={isLoading}
        error={sections.length === 0 ? error : null}
        isEmpty={visibleSections.length === 0}
        emptyMessage={filtered ? TODAYS_CLAIMS_TAB_COPY.noMatch : TODAYS_CLAIMS_TAB_COPY.empty}
      >
        <TodaysSections
          lobby={lobby}
          sections={visibleSections}
          isOpen={sectionsOpen.isOpen}
          onToggle={(section, open) => {
            sectionsOpen.setOpen(section.key, open);
            recordFilter(LIST_ID, { kind: 'section', value: section.sectionId, selected: open });
          }}
        />
      </HubQueryState>
    </div>
  );
}

type VisibleSection = ReturnType<typeof useTodaysClaimsList>['sections'][number];

function TodaysSections({
  lobby,
  sections,
  isOpen,
  onToggle,
}: {
  lobby: LobbyPageView;
  sections: VisibleSection[];
  isOpen: (sectionKey: string, defaultOpen: boolean) => boolean;
  onToggle: (section: VisibleSection, open: boolean) => void;
}) {
  const { authenticated, accountKey } = useGeoChatAuth();

  // geo-chat's rows for the agendas' claims, each in its agenda's space: the viewer's side, who stands
  // ready on each, a live debate. A claim with no row still lists, with no sides.
  const groups = React.useMemo(
    () =>
      authenticated && accountKey
        ? claimRowGroups(
            sections.flatMap(section => section.claims.map(claim => ({ spaceId: claim.spaceId, claimId: claim.id })))
          )
        : [],
    [accountKey, authenticated, sections]
  );
  const rows = useDebateClaimsBySpaces(groups);
  const entriesBySection = React.useMemo(() => {
    const byClaim = rowsByPlacedClaim(rows.claims);
    return sections.map(section =>
      section.claims.map(claim => ({
        entry: taggedClaimEntry(
          claim,
          claim.spaceId,
          byClaim.get(placedClaimKey({ spaceId: claim.spaceId, claimId: claim.id }))
        ),
        claim,
      }))
    );
  }, [sections, rows.claims]);
  // GEO-3495. Where each section starts in the list's numbering.
  const sectionOffsets = sectionStartOffsets(sections.map(section => section.claims.length));

  const batches = React.useMemo(
    () => exploreRoomClaimBatches(entriesBySection.flat().map(({ entry }) => entry)),
    [entriesBySection]
  );
  const renderRoomCard = useLobbyRoomCardRenderer(lobby, batches);

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <CollapsibleClaimSection
          key={section.key}
          name={section.name}
          count={section.claims.length}
          open={isOpen(section.key, true)}
          onToggle={open => onToggle(section, open)}
          // Not the section's name, which an agenda's editor wrote.
          analytics={debateActionAnalyticsAttributes('hub', 'Lobby Today’s claims section toggle')}
        >
          <HubCardList>
            {(entriesBySection[index] ?? []).map(({ entry, claim }, position) => (
              <DebateClaimCardSurface
                key={claimRowKey(entry)}
                claimId={entry.claim.claim_entity_id}
                listId={LIST_ID}
                position={sectionOffsets[index] + position + 1}
                scope={claim.scope}
              >
                {renderRoomCard(
                  entry,
                  placedAnswersReady({ authenticated, accountKey }, rows.unresolvedSpaceIds, entry.claim.space_id)
                )}
              </DebateClaimCardSurface>
            ))}
          </HubCardList>
        </CollapsibleClaimSection>
      ))}
    </div>
  );
}
