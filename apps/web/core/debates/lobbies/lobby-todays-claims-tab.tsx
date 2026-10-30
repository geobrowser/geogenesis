'use client';

import * as React from 'react';

import { useSpaceLabels } from '~/core/hooks/use-space-labels';

import { DebateClaimCardSurface, sectionStartOffsets, useRecordClaimFilter } from '../debate-claim-card-surface';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { CollapsibleClaimSection } from '../matchmaking/collapsible-claim-section';
import { FacetFilterPills } from '../matchmaking/facet-filter-pills';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { panelFacetOptions } from '../matchmaking/hub-filters';
import { HubCardList } from '../matchmaking/hub-motion';
import { HubQueryState } from '../matchmaking/hub-states';
import { carriesEveryTopic, countBy, hasId, inEverySpace, toggleId } from '../matchmaking/topic-facets';
import { useTodaysSectionsOpen } from '../todays-claims/section-open-state';
import { type TodaysListClaim, useTodaysClaimsList } from '../todays-claims/todays-claims-list';
import { useLobbyListCards } from './lobby-claim-list-tab';
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
  const pillOptions = React.useMemo(
    () =>
      panelFacetOptions({
        spaces: countBy(narrowed.map(claim => ({ id: claim.spaceId, name: null }))),
        topics: countBy(narrowed.flatMap(claim => claim.topics)),
        spaceIds,
        topicIds,
        listedCount: narrowed.length,
        labelsById,
        labelsLoading,
        topicsWithSpaces: true,
      }),
    [labelsById, labelsLoading, narrowed, spaceIds, topicIds]
  );
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
  const { entriesBySection, renderCard } = useLobbyListCards(lobby, sections);
  // GEO-3495. Where each section starts in the list's numbering.
  const sectionOffsets = sectionStartOffsets(sections.map(section => section.claims.length));

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
            {(entriesBySection[index] ?? []).map((entry, position) => (
              <DebateClaimCardSurface
                key={claimRowKey(entry)}
                claimId={entry.claim.claim_entity_id}
                listId={LIST_ID}
                position={sectionOffsets[index] + position + 1}
                scope={section.claims[position]!.scope}
              >
                {renderCard(entry)}
              </DebateClaimCardSurface>
            ))}
          </HubCardList>
        </CollapsibleClaimSection>
      ))}
    </div>
  );
}
