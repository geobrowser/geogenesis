'use client';

import * as React from 'react';

import { useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Text } from '~/design-system/text';

import { DebateClaimCardSurface, sectionStartOffsets, useRecordClaimFilter } from '../debate-claim-card-surface';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { CollapsibleClaimSection } from '../matchmaking/collapsible-claim-section';
import { FacetFilterPills } from '../matchmaking/facet-filter-pills';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { panelFacetOptions } from '../matchmaking/hub-filters';
import { HubCardList } from '../matchmaking/hub-motion';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { HubQueryState } from '../matchmaking/hub-states';
import { carriesEveryTopic, countBy, hasId, inEverySpace, toggleId } from '../matchmaking/topic-facets';
import { useTodaysSectionsOpen } from '../todays-claims/section-open-state';
import { type TodaysListClaim, useTodaysClaimsList } from '../todays-claims/todays-claims-list';
import { useLobbyListCards } from './lobby-claim-list-tab';
import type { LobbyPageView } from './lobby-view';

export const TODAYS_CLAIMS_TAB_COPY = {
  empty: 'No agendas today yet.',
  noMatch: 'No claims match these filters.',
  partial: 'Some claims didn’t load.',
  retry: 'Try again',
};

const LIST_ID = 'todays_claims_lobby';

/** The space a lobby's Today's claims leads with: its own, for a space's call; none for a lobby. */
export function todaysLeadSpaceId(lobby: Pick<LobbyPageView, 'call'>): string | null {
  return lobby.call?.space_id ?? null;
}

/**
 * A lobby's "Today's claims" tab (GEO-3491): every space's newest Debate agenda, the lobby's own space
 * first when it has one, under the agendas' section headings. The same single row of space and topic
 * pills as the debate-again picker (AND, each counted by what picking it would leave), and the same
 * collapsible sections, each holding the cards the lobby's other lists draw.
 */
export function LobbyTodaysClaimsTab({ lobby }: { lobby: LobbyPageView }) {
  const { sections, newestDay, isLoading, error, refetch } = useTodaysClaimsList({
    leadSpaceId: todaysLeadSpaceId(lobby),
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
      {/* Some of the agendas' claims failed while others listed: say the list is short, with the
          same Try again the whole-tab error offers, rather than drawing it as if it were whole. */}
      {error && sections.length > 0 ? (
        <div className="flex items-center justify-between gap-3" role="status">
          <Text as="p" variant="footnote" color="grey-04">
            {TODAYS_CLAIMS_TAB_COPY.partial}
          </Text>
          <HubPillButton analyticsLabel="Lobby Today’s claims retry" onClick={refetch}>
            {TODAYS_CLAIMS_TAB_COPY.retry}
          </HubPillButton>
        </div>
      ) : null}
      <HubQueryState
        analyticsSurface="hub"
        isLoading={isLoading}
        error={sections.length === 0 ? error : null}
        onRetry={refetch}
        isEmpty={visibleSections.length === 0}
        emptyMessage={filtered ? TODAYS_CLAIMS_TAB_COPY.noMatch : TODAYS_CLAIMS_TAB_COPY.empty}
      >
        <TodaysSections
          lobby={lobby}
          sections={sections}
          passes={passes}
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

type TodaysSection = ReturnType<typeof useTodaysClaimsList>['sections'][number];

/**
 * The sections' cards, under the pills. The cards are built over every listed claim and the pills
 * only choose which are drawn: built from the narrowed list, each pick re-asked geo-chat for the
 * rows behind them, and the cards lost their sides until it answered.
 */
function TodaysSections({
  lobby,
  sections,
  passes,
  isOpen,
  onToggle,
}: {
  lobby: LobbyPageView;
  sections: TodaysSection[];
  passes: (claim: TodaysListClaim) => boolean;
  isOpen: (sectionKey: string, defaultOpen: boolean) => boolean;
  onToggle: (section: TodaysSection, open: boolean) => void;
}) {
  const { entriesBySection, renderCard } = useLobbyListCards(lobby, sections);
  const drawn = sections.flatMap((section, index) => {
    const cards = section.claims.flatMap((claim, position) => {
      const entry = entriesBySection[index]?.[position];
      return entry && passes(claim) ? [{ claim, entry }] : [];
    });
    return cards.length > 0 ? [{ section, cards }] : [];
  });
  // GEO-3495. Where each drawn section starts in the list's numbering.
  const sectionOffsets = sectionStartOffsets(drawn.map(({ cards }) => cards.length));

  return (
    <div className="flex flex-col gap-4">
      {drawn.map(({ section, cards }, index) => (
        <CollapsibleClaimSection
          key={section.key}
          name={section.name}
          count={cards.length}
          open={isOpen(section.key, true)}
          onToggle={open => onToggle(section, open)}
          // Not the section's name, which an agenda's editor wrote.
          analytics={debateActionAnalyticsAttributes('hub', 'Lobby Today’s claims section toggle')}
        >
          <HubCardList>
            {cards.map(({ claim, entry }, position) => (
              <DebateClaimCardSurface
                key={claimRowKey(entry)}
                claimId={entry.claim.claim_entity_id}
                listId={LIST_ID}
                position={sectionOffsets[index] + position + 1}
                scope={claim.scope}
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
