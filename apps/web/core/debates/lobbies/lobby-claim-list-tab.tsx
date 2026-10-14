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
import { HubStickyControls } from '../matchmaking/claims-tab';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubCardList } from '../matchmaking/hub-motion';
import { useHubScrollSelector } from '../matchmaking/hub-scroll';
import { HubQueryState } from '../matchmaking/hub-states';
import { taggedClaimEntry } from '../matchmaking/tagged-claim-entry';
import { useRemoveLobbyClaimList } from './lobby-claim-lists-hooks';
import { LOBBY_CLAIMS_CONTROLS_TOP_CLASS } from './lobby-claims-sticky';
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

  // geo-chat's rows for the page's claims, each in the space it is debated in: the viewer's side,
  // who stands ready on each, a live debate. A claim with no row still lists, with no sides.
  const groups = React.useMemo(() => {
    if (!authenticated || !accountKey) return [];
    const bySpace = new Map<string, Set<string>>();
    for (const claim of page.sections.flatMap(section => section.claims)) {
      const ids = bySpace.get(claim.spaceId) ?? new Set<string>();
      ids.add(claim.id);
      bySpace.set(claim.spaceId, ids);
    }
    return [...bySpace.entries()]
      .sort(([a], [z]) => a.localeCompare(z))
      .map(([spaceId, ids]) => ({ spaceId, claimIds: [...ids] }));
  }, [accountKey, authenticated, page.sections]);
  const rows = useDebateClaimsBySpaces(groups);
  const entriesBySection = React.useMemo(() => {
    // By space and claim, as Explore keys them: one claim can have a row in two spaces.
    const rowKey = (spaceId: string, claimId: string) => `${ID.uuidToHex(spaceId)}:${ID.uuidToHex(claimId)}`;
    const byClaim = new Map(rows.claims.map(row => [rowKey(row.space_id, row.claim_entity_id), row]));
    return page.sections.map(section =>
      section.claims.map(claim => taggedClaimEntry(claim, claim.spaceId, byClaim.get(rowKey(claim.spaceId, claim.id))))
    );
  }, [page.sections, rows.claims]);
  // As the Explore tab decides it, per card, for the space the card is in.
  const answersReadyFor = (spaceId: string) =>
    !authenticated || (Boolean(accountKey) && !rows.unresolvedSpaceIds.has(spaceId));

  // In page order, so a long page reads a section's room sides as it scrolls into view.
  const batches = React.useMemo(() => exploreRoomClaimBatches(entriesBySection.flat()), [entriesBySection]);
  const renderRoomCard = useLobbyRoomCardRenderer(lobby, batches);

  const sectionDomId = (section: ClaimListSection) => `lobby-claim-list-${page.entityId}-${section.id}`;
  // Only the box the claims scroll in: `scrollIntoView` scrolls every ancestor, and moved the
  // whole lobby page along with the column on desktop.
  const hubScrollSelector = useHubScrollSelector();
  const jumpTo = (section: ClaimListSection) => {
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
        <HubStickyControls topClassName={LOBBY_CLAIMS_CONTROLS_TOP_CLASS}>
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
        </HubStickyControls>
      ) : null}
      {page.sections.map((section, index) => (
        <section
          key={section.id}
          id={sectionDomId(section)}
          aria-label={section.name}
          // Clear of the pinned tab row and themes when a theme chip scrolls here.
          className="flex scroll-mt-[calc(var(--lobby-claims-tabs-h,2rem)+3.5rem)] flex-col gap-2 px-4 md:scroll-mt-[calc(var(--lobby-claims-tabs-h,2rem)+6.25rem)]"
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
              React.cloneElement(renderRoomCard(entry, answersReadyFor(entry.claim.space_id)), {
                key: claimRowKey(entry),
              })
            )}
          </HubCardList>
        </section>
      ))}
    </div>
  );
}

/**
 * Brings `node` to the top of `scroller`, or of the page when the claims have no box of their own
 * (phones), clear of whatever is pinned there: the offset is the section's own `scroll-margin-top`.
 */
export function scrollToSection(node: HTMLElement, scroller: HTMLElement | null) {
  const margin = Number.parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
  const nodeTop = node.getBoundingClientRect().top;
  if (scroller) {
    const top = nodeTop - scroller.getBoundingClientRect().top + scroller.scrollTop - margin;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior: 'smooth' });
    else scroller.scrollTop = top;
    return;
  }
  window.scrollTo({ top: nodeTop + window.scrollY - margin, behavior: 'smooth' });
}
