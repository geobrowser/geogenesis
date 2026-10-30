'use client';

import * as React from 'react';

import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList, MatchmakingClaim } from '../api';
import { type PlacedClaimListSection, placeClaimListSections, useClaimListPage } from '../claim-list-pages';
import { DebateClaimCardSurface, sectionStartOffsets } from '../debate-claim-card-surface';
import { useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { HubStickyControls } from '../matchmaking/claims-tab';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubCardList } from '../matchmaking/hub-motion';
import { scrollToSection, useHubScrollSelector } from '../matchmaking/hub-scroll';
import { HubQueryState } from '../matchmaking/hub-states';
import {
  claimRowGroups,
  placedAnswersReady,
  placedClaimKey,
  rowsByPlacedClaim,
  taggedClaimEntry,
} from '../matchmaking/tagged-claim-entry';
import { TODAYS_CLAIMS_LIST_NAME, isTodaysClaimsList } from '../todays-claims/todays-claims-list-id';
import { useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useRemoveLobbyClaimList } from './lobby-claim-lists-hooks';
import { LOBBY_CLAIMS_CONTROLS_TOP_CLASS, LOBBY_CLAIMS_SECTION_SCROLL_MARGIN_CLASS } from './lobby-claims-sticky';
import { useLobbyRoomCardRenderer } from './lobby-explore-claims';
import { exploreRoomClaimBatches } from './lobby-explore-claims-hooks';
import { moderationErrorMessage, personName } from './lobby-format';
import type { LobbyPageView } from './lobby-view';

export const CLAIM_LIST_TAB_COPY = {
  fallbackName: 'Claim list',
  openPage: 'Open the full page',
  gone: 'This list is no longer available.',
  remove: 'Remove from lobby',
  removing: 'Removing…',
  empty: 'This list has no claims yet.',
};

/** The tab's label: the page's own name, once the page has been read; Today's claims by its own. */
export function useClaimListName(list: Pick<DebateLobbyClaimList, 'entity_id' | 'space_id'>) {
  const { data } = useClaimListPage(list.entity_id, list.space_id);
  if (isTodaysClaimsList(list.entity_id)) return TODAYS_CLAIMS_LIST_NAME;
  return data?.name ?? CLAIM_LIST_TAB_COPY.fallbackName;
}

/**
 * One claim list tab (GEO-3274): the page's themes as sections, each a list of the same cards the
 * Explore tab draws, so a card here has the room's sides, Request debate and the host menu. A page
 * deleted while it sat on the lobby says so, and hosts can take its tab away.
 */
export function LobbyClaimListTab({ lobby, list }: { lobby: LobbyPageView; list: DebateLobbyClaimList }) {
  const { data: page, isLoading, error, refetch } = useClaimListPage(list.entity_id, list.space_id);
  const remove = useRemoveLobbyClaimList(lobby.lobby_id);
  const { publishableSpaceIds } = useDebatePublishableSpaces();
  const sections = React.useMemo(
    () => (page ? placeClaimListSections(page, publishableSpaceIds) : []),
    [page, publishableSpaceIds]
  );
  const gone = page === null;

  return (
    <HubQueryState
      analyticsSurface="hub"
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={sections.length === 0}
      emptyMessage={gone ? CLAIM_LIST_TAB_COPY.gone : CLAIM_LIST_TAB_COPY.empty}
      // As the tab menu does: why a removal failed, and no second request while one is out.
      emptyNote={
        gone && remove.error ? (
          <Text as="p" variant="footnote" color="red-01">
            {moderationErrorMessage(remove.error)}
          </Text>
        ) : undefined
      }
      emptyAction={
        gone && lobby.viewer.hosting
          ? {
              label: remove.isPending ? CLAIM_LIST_TAB_COPY.removing : CLAIM_LIST_TAB_COPY.remove,
              onClick: () => {
                if (!remove.isPending) remove.mutate(list.entity_id);
              },
            }
          : undefined
      }
    >
      {page ? <ClaimListSections lobby={lobby} list={list} page={page} sections={sections} /> : null}
    </HubQueryState>
  );
}

function ClaimListSections({
  lobby,
  list,
  page,
  sections,
}: {
  lobby: LobbyPageView;
  list: DebateLobbyClaimList;
  page: { entityId: string; spaceId: string };
  sections: PlacedClaimListSection[];
}) {
  const { entriesBySection, renderCard } = useLobbyListCards(lobby, sections);
  // GEO-3495. Where each section starts in the page's numbering.
  const sectionOffsets = sectionStartOffsets(sections.map(section => section.claims.length));

  const sectionDomId = (section: PlacedClaimListSection) => `lobby-claim-list-${page.entityId}-${section.id}`;
  // Only the box the claims scroll in: `scrollIntoView` scrolls every ancestor, and moved the
  // whole lobby page along with the column on desktop.
  const hubScrollSelector = useHubScrollSelector();
  const jumpTo = (section: PlacedClaimListSection) => {
    const node = document.getElementById(sectionDomId(section));
    if (node) scrollToSection(node, hubScrollSelector ? node.closest<HTMLElement>(hubScrollSelector) : null);
  };
  const addedBy = list.added_by ? personName(list.added_by) : null;

  // Edge to edge, so the pinned themes span the column the way Explore's pinned search does.
  return (
    <div className="-mx-4 flex flex-col gap-3" data-testid="lobby-claim-list-tab">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4">
        <Text as="p" variant="footnote" color="grey-04">
          {addedBy ? `Added by ${addedBy} · ` : ''}
          {sections.length} {sections.length === 1 ? 'theme' : 'themes'}
        </Text>
        <Link
          href={NavUtils.toEntity(page.spaceId, page.entityId)}
          {...hubAnalyticsAttributes('Lobby claim list open page', 'open_lobby_claim_list_page')}
          className="text-footnote text-grey-04 underline hover:text-text"
        >
          {CLAIM_LIST_TAB_COPY.openPage}
        </Link>
      </div>
      {sections.length > 1 ? (
        <HubStickyControls topClassName={LOBBY_CLAIMS_CONTROLS_TOP_CLASS}>
          <nav
            aria-label="Themes"
            className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4"
          >
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                {...hubAnalyticsAttributes('Lobby claim list theme', 'jump_lobby_claim_list_theme')}
                onClick={() => jumpTo(section)}
                className="shrink-0 rounded-full border border-grey-02 bg-white px-2.5 py-1 text-footnoteMedium whitespace-nowrap text-text transition-colors hover:bg-grey-01"
              >
                {section.name}
              </button>
            ))}
          </nav>
        </HubStickyControls>
      ) : null}
      {sections.map((section, index) => (
        <section
          key={section.id}
          id={sectionDomId(section)}
          aria-label={section.name}
          // Clear of the pinned tab row and themes when a theme chip scrolls here.
          className={`flex flex-col gap-2 px-4 ${LOBBY_CLAIMS_SECTION_SCROLL_MARGIN_CLASS}`}
        >
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <Text as="h3" variant="metadataMedium">
              {section.name}
            </Text>
            <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
              {section.claims.length} {section.claims.length === 1 ? 'claim' : 'claims'}
            </Text>
          </div>
          <HubCardList>
            {(entriesBySection[index] ?? []).map((entry, position) => (
              // GEO-3495: the card's impression, and a request sent from it, name this list, its
              // section and the card's place counted down the whole page.
              <DebateClaimCardSurface
                key={claimRowKey(entry)}
                claimId={entry.claim.claim_entity_id}
                listId="lobby_list"
                position={sectionOffsets[index] + position + 1}
                scope={{ list_entity_id: list.entity_id, list_section_id: section.id }}
              >
                {renderCard(entry)}
              </DebateClaimCardSurface>
            ))}
          </HubCardList>
        </section>
      ))}
    </div>
  );
}

/** A lobby list's claim: placed in the one space its card is drawn and debated in. */
type LobbyListClaim = { id: string; name: string; description: string | null; spaceId: string };

/**
 * The cards of a lobby list tab, section by section: the claim list tabs and Today's claims
 * (GEO-3491) draw the same cards, the ones the Explore tab draws, so a card has the room's sides,
 * Request debate and the host menu.
 *
 * geo-chat's rows for the claims, each in the space it is debated in, give the viewer's side, who
 * stands ready on each, and a live debate. A claim with no row still lists, with no sides. Room sides
 * are read in list order, so a long list reads a section's as it scrolls into view.
 */
export function useLobbyListCards(lobby: LobbyPageView, sections: readonly { claims: readonly LobbyListClaim[] }[]) {
  const { authenticated, accountKey } = useGeoChatAuth();
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
      section.claims.map(claim =>
        taggedClaimEntry(
          claim,
          claim.spaceId,
          byClaim.get(placedClaimKey({ spaceId: claim.spaceId, claimId: claim.id }))
        )
      )
    );
  }, [sections, rows.claims]);
  const batches = React.useMemo(() => exploreRoomClaimBatches(entriesBySection.flat()), [entriesBySection]);
  const renderRoomCard = useLobbyRoomCardRenderer(lobby, batches);
  const renderCard = (entry: MatchmakingClaim) =>
    renderRoomCard(
      entry,
      placedAnswersReady({ authenticated, accountKey }, rows.unresolvedSpaceIds, entry.claim.space_id)
    );
  return { entriesBySection, renderCard };
}
