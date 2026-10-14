'use client';

import * as React from 'react';

import Link from 'next/link';

import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList, MatchmakingClaim } from '../api';
import { type ClaimListPage, type ClaimListSection, useClaimListPage } from '../claim-list-pages';
import { useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubCardList } from '../matchmaking/hub-motion';
import { HubSkeleton } from '../matchmaking/hub-states';
import { taggedClaimEntry } from '../matchmaking/tagged-claim-entry';
import { useRemoveLobbyClaimList } from './lobby-claim-lists-hooks';
import { NearViewport, exploreRoomClaim, hasDebateClaimRow } from './lobby-explore-claims';
import {
  exploreRoomClaimBatches,
  useLobbyExploreRoomClaims,
  useNearExploreBatches,
} from './lobby-explore-claims-hooks';
import { personName } from './lobby-format';
import { LobbyClaimHostMenu } from './lobby-highlights';
import { useLobbyHighlights } from './lobby-highlights-hooks';
import { LobbyClaimRequest } from './lobby-room-claims';
import { type LobbyRoomClaim, LobbyRoomClaimCard, type LobbyRoomOffer } from './lobby-room-claims-list';
import type { LobbyPageView } from './lobby-view';

export const CLAIM_LIST_TAB_COPY = {
  fallbackName: 'Claim list',
  openPage: 'Open the full page',
  gone: 'This list is no longer available.',
  remove: 'Remove from lobby',
  failed: 'Could not load this list.',
  retry: 'Try again',
  empty: 'This list has no claims yet.',
};

/** The tab's label: the page's own name, once the page has been read. */
export function useClaimListName(list: Pick<DebateLobbyClaimList, 'entity_id' | 'space_id'>) {
  const { data } = useClaimListPage(list.entity_id, list.space_id);
  return data?.name ?? CLAIM_LIST_TAB_COPY.fallbackName;
}

/**
 * One claim list tab (GEO-3274): the page's themes as sections, each a list of the same cards the
 * Explore tab draws, so a card here has the room's sides, Request debate and the host menu.
 */
export function LobbyClaimListTab({ lobby, list }: { lobby: LobbyPageView; list: DebateLobbyClaimList }) {
  const { data: page, isLoading, error, refetch } = useClaimListPage(list.entity_id, list.space_id);
  const hosting = lobby.viewer.hosting;

  if (isLoading) return <HubSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 py-4">
        <Text as="p" variant="metadata" color="grey-04">
          {CLAIM_LIST_TAB_COPY.failed}
        </Text>
        <button
          type="button"
          {...hubAnalyticsAttributes('Lobby claim list retry', 'retry_lobby_claim_list')}
          onClick={() => void refetch()}
          className="text-button text-text underline"
        >
          {CLAIM_LIST_TAB_COPY.retry}
        </button>
      </div>
    );
  }
  if (!page) return <ClaimListGone lobbyId={lobby.lobby_id} list={list} hosting={hosting} />;
  return <ClaimListSections lobby={lobby} list={list} page={page} />;
}

/** The page was deleted while it sat on the lobby. Hosts can take the tab away. */
function ClaimListGone({ lobbyId, list, hosting }: { lobbyId: string; list: DebateLobbyClaimList; hosting: boolean }) {
  const remove = useRemoveLobbyClaimList(lobbyId);
  return (
    <div className="flex flex-col items-start gap-2 py-4">
      <Text as="p" variant="metadata" color="grey-04">
        {CLAIM_LIST_TAB_COPY.gone}
      </Text>
      {hosting ? (
        <button
          type="button"
          disabled={remove.isPending}
          {...hubAnalyticsAttributes('Lobby remove missing claim list', 'remove_lobby_claim_list')}
          onClick={() => remove.mutate(list.entity_id)}
          className="text-button text-red-01 disabled:opacity-50"
        >
          {CLAIM_LIST_TAB_COPY.remove}
        </button>
      ) : null}
    </div>
  );
}

function ClaimListSections({
  lobby,
  list,
  page,
}: {
  lobby: LobbyPageView;
  list: DebateLobbyClaimList;
  page: ClaimListPage;
}) {
  const lobbyId = lobby.lobby_id;
  const hosting = lobby.viewer.hosting;
  const { authenticated, accountKey } = useGeoChatAuth();

  // geo-chat's rows for the page's claims, in the one space the tab reads: the viewer's side, who
  // stands ready on each, a live debate. A claim with no row still lists, with no sides.
  const claimIds = React.useMemo(
    () => [...new Set(page.sections.flatMap(section => section.claims.map(claim => claim.id)))],
    [page.sections]
  );
  const groups = React.useMemo(
    () => (authenticated && accountKey && claimIds.length > 0 ? [{ spaceId: page.spaceId, claimIds }] : []),
    [accountKey, authenticated, claimIds, page.spaceId]
  );
  const rows = useDebateClaimsBySpaces(groups);
  const entriesBySection = React.useMemo(() => {
    const byClaim = new Map(rows.claims.map(row => [ID.uuidToHex(row.claim_entity_id), row]));
    return page.sections.map(section =>
      section.claims.map(claim => taggedClaimEntry(claim, page.spaceId, byClaim.get(claim.id)))
    );
  }, [page.sections, page.spaceId, rows.claims]);
  const answersReady = !authenticated || (Boolean(accountKey) && !rows.unresolvedSpaceIds.has(page.spaceId));

  // The room's sides, read only for the batches holding a card near the viewport, so a long page
  // reads a section's sides as it scrolls into view rather than all of them up front.
  const batches = React.useMemo(() => exploreRoomClaimBatches(entriesBySection.flat()), [entriesBySection]);
  const { active, onNear } = useNearExploreBatches(batches);
  const roomRows = useLobbyExploreRoomClaims(lobbyId, active);
  const { data: highlights } = useLobbyHighlights(lobbyId);

  const renderOffer = React.useCallback(
    (offer: LobbyRoomOffer) => <LobbyClaimRequest lobbyId={lobbyId} offer={offer} />,
    [lobbyId]
  );
  const renderMenu = React.useCallback(
    (entry: LobbyRoomClaim) =>
      hasDebateClaimRow(entry.claim) ? (
        <LobbyClaimHostMenu lobbyId={lobbyId} claim={entry.claim} state={highlights} />
      ) : null,
    [highlights, lobbyId]
  );

  const sectionDomId = (section: ClaimListSection) => `lobby-claim-list-${page.entityId}-${section.id}`;
  const jumpTo = (section: ClaimListSection) => {
    const node = document.getElementById(sectionDomId(section));
    if (typeof node?.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addedBy = list.added_by ? personName(list.added_by) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="lobby-claim-list-tab">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Text as="p" variant="footnote" color="grey-04">
          {addedBy ? `Added by ${addedBy} · ` : ''}
          {page.sections.length} {page.sections.length === 1 ? 'theme' : 'themes'}
        </Text>
        <Link
          href={NavUtils.toEntity(page.spaceId, page.entityId)}
          {...hubAnalyticsAttributes('Lobby claim list open page', 'open_lobby_claim_list_page')}
          className="text-footnote text-grey-04 underline hover:text-text"
        >
          {CLAIM_LIST_TAB_COPY.openPage}
        </Link>
      </div>
      {page.sections.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04" className="py-4">
          {CLAIM_LIST_TAB_COPY.empty}
        </Text>
      ) : (
        <>
          {page.sections.length > 1 ? (
            <nav
              aria-label="Themes"
              className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4"
            >
              {page.sections.map(section => (
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
          ) : null}
          {page.sections.map((section, index) => (
            <section
              key={section.id}
              id={sectionDomId(section)}
              aria-label={section.name}
              className="flex scroll-mt-4 flex-col gap-2"
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
                {(entriesBySection[index] ?? []).map((entry: MatchmakingClaim) => (
                  <NearViewport key={claimRowKey(entry)} claimEntityId={entry.claim.claim_entity_id} onNear={onNear}>
                    <LobbyRoomClaimCard
                      entry={exploreRoomClaim(entry, roomRows.get(claimRowKey(entry)))}
                      answersReady={answersReady}
                      renderOffer={renderOffer}
                      renderMenu={hosting ? renderMenu : undefined}
                    />
                  </NearViewport>
                ))}
              </HubCardList>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
