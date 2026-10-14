'use client';

import * as React from 'react';

import Link from 'next/link';

import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList } from '../api';
import { type ClaimListPage, type ClaimListSection, useClaimListPage } from '../claim-list-pages';
import { useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubCardList } from '../matchmaking/hub-motion';
import { HubQueryState } from '../matchmaking/hub-states';
import { taggedClaimEntry } from '../matchmaking/tagged-claim-entry';
import { useRemoveLobbyClaimList } from './lobby-claim-lists-hooks';
import { useLobbyRoomCardRenderer } from './lobby-explore-claims';
import { exploreRoomClaimBatches } from './lobby-explore-claims-hooks';
import { personName } from './lobby-format';
import type { LobbyPageView } from './lobby-view';

export const CLAIM_LIST_TAB_COPY = {
  fallbackName: 'Claim list',
  openPage: 'Open the full page',
  gone: 'This list is no longer available.',
  remove: 'Remove from lobby',
  empty: 'This list has no claims yet.',
};

/** The tab's label: the page's own name, once the page has been read. */
export function useClaimListName(list: Pick<DebateLobbyClaimList, 'entity_id' | 'space_id'>) {
  const { data } = useClaimListPage(list.entity_id, list.space_id);
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
  const gone = page === null;

  return (
    <HubQueryState
      analyticsSurface="hub"
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={!page || page.sections.length === 0}
      emptyMessage={gone ? CLAIM_LIST_TAB_COPY.gone : CLAIM_LIST_TAB_COPY.empty}
      emptyAction={
        gone && lobby.viewer.hosting
          ? { label: CLAIM_LIST_TAB_COPY.remove, onClick: () => remove.mutate(list.entity_id) }
          : undefined
      }
    >
      {page ? <ClaimListSections lobby={lobby} list={list} page={page} /> : null}
    </HubQueryState>
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
  // As the Explore tab decides it for a card in this space.
  const answersReady = !authenticated || (Boolean(accountKey) && !rows.unresolvedSpaceIds.has(page.spaceId));

  // In page order, so a long page reads a section's room sides as it scrolls into view.
  const batches = React.useMemo(() => exploreRoomClaimBatches(entriesBySection.flat()), [entriesBySection]);
  const renderRoomCard = useLobbyRoomCardRenderer(lobby, batches);

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
      {page.sections.length > 1 ? (
        <nav aria-label="Themes" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4">
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
            {(entriesBySection[index] ?? []).map(entry =>
              // Keyed on the element itself, as `ClaimsTab` does: the list's popLayout measures it.
              React.cloneElement(renderRoomCard(entry, answersReady), { key: claimRowKey(entry) })
            )}
          </HubCardList>
        </section>
      ))}
    </div>
  );
}
