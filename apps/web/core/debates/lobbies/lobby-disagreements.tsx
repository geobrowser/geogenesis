'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import type { DebateLobbyClaim, DebateLobbyMember } from '../api';
import { useBackfillReadinessForHeldPosition } from '../backfill-readiness-for-held-position';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubQueryState, HubSkeleton } from '../matchmaking/hub-states';
import { sameId } from '../rooms/room-presence';
import { personName } from './lobby-format';
import { LobbyPopup } from './lobby-popup';
import { LobbyClaimRequest, lobbyRoomClaimFrom } from './lobby-room-claims';
import { RECIPIENT_UNAVAILABLE_MESSAGE, useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { roomSideOpposing, useLobbyViewerPosition } from './lobby-room-claims-list';
import type { LobbyPageView } from './lobby-view';

export const LOBBY_DISAGREEMENTS_COPY = {
  disagreesOn: (count: number) => `Disagrees on ${count}`,
  heading: (name: string) => `You and ${name} disagree on`,
  /** geo-chat lists at most 8 people per side, so a busy claim can leave someone off its list. */
  unlisted: (count: number, more: boolean) =>
    `${count} ${more ? 'more ' : ''}${count === 1 ? 'claim isn’t' : 'claims aren’t'} listed here.`,
} as const;

/** A claim the viewer and one person hold opposite sides on, with the request that person can take. */
export type LobbyDisagreement = {
  row: DebateLobbyClaim;
  viewerPosition: boolean;
  viewerLabel: string;
  theirLabel: string;
  /** Whether a lobby-scoped request can go to them on this claim now. */
  requestable: boolean;
  previouslyDebated: boolean;
};

/**
 * The room's claims where the viewer holds one side and `userId` is listed on the other, in the
 * server's order. Each side lists at most 8 people, requestable first, so this can fall short of the
 * count geo-chat gives in `disagreements`. A row in `previous` that a full list no longer names is
 * kept, unrequestable: a refusal can push the person off the list, and the row holds that refusal.
 */
export function lobbyDisagreements(
  claims: DebateLobbyClaim[],
  userId: string,
  previous: readonly LobbyDisagreement[] = []
): LobbyDisagreement[] {
  return claims.flatMap(row => {
    const viewer = row.viewer_response;
    if (!viewer) return [];
    const theirs = roomSideOpposing(row.positions, viewer.position);
    if (!theirs) return [];
    const person = theirs.participants.find(participant => sameId(participant.user_id, userId));
    if (!person) {
      const kept = previous.find(entry => entry.row.claim.id === row.claim.id);
      const cutOff = theirs.participants.length < theirs.total_in_room;
      // Listed on the viewer's side, they moved; a cut-off list only leaves it unknown.
      const joinedViewer = row.positions.some(
        side =>
          side.position === viewer.position &&
          side.participants.some(participant => sameId(participant.user_id, userId))
      );
      return kept && cutOff && !joinedViewer && kept.viewerPosition === viewer.position
        ? [{ ...kept, row, requestable: false }]
        : [];
    }
    return [
      {
        row,
        viewerPosition: viewer.position,
        viewerLabel: viewer.position_label,
        theirLabel: theirs.position_label,
        requestable: person.requestable,
        previouslyDebated: person.previously_debated ?? false,
      },
    ];
  });
}

/**
 * "Disagrees on N" on a speaker tile, opening the claims behind the count, each with a request to
 * that one person. Sits beside the tile's person button, not inside it: a button can't hold another.
 */
export function LobbyDisagreementsTrigger({
  lobby,
  member,
  count,
  variant,
  hidden = false,
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  count: number;
  /** `pill` on desktop, `line` for a phone tile's one status line. */
  variant: 'pill' | 'line';
  /** Hides the trigger but keeps the popup mounted, so an open sheet survives the line changing. */
  hidden?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const name = personName(member);
  const label = LOBBY_DISAGREEMENTS_COPY.disagreesOn(count);

  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      title={LOBBY_DISAGREEMENTS_COPY.heading(name)}
      align="center"
      wide
      trigger={
        <button
          type="button"
          aria-label={`${label} ${count === 1 ? 'claim' : 'claims'} with ${name}`}
          {...debateActionAnalyticsAttributes('hub', 'Lobby disagreements')}
          data-testid="lobby-disagreements-trigger"
          // Above the tile's stretched person button, which covers the rest of the tile.
          className={cx(
            'relative z-10 max-w-full font-medium whitespace-nowrap text-[#C42D17]',
            hidden && 'hidden!',
            variant === 'pill'
              ? 'inline-flex h-5 items-center rounded-full bg-red-02 px-2 text-[11px] leading-[13px] transition-colors hover:bg-red-02/70 data-[state=open]:ring-1 data-[state=open]:ring-[#C42D17]'
              : 'truncate text-[11px] leading-[13px] underline-offset-2 hover:underline'
          )}
        >
          {label}
        </button>
      }
    >
      <LobbyDisagreementsList lobby={lobby} member={member} count={count} />
    </LobbyPopup>
  );
}

export function LobbyDisagreementsList({
  lobby,
  member,
  count,
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  count: number;
}) {
  const query = useDebateLobbyClaims(lobby.lobby_id);
  const name = personName(member);
  const claims = query.data?.claims;
  // The last rows shown, so a refresh can keep one a refusal pushed off a full list.
  const [shown, setShown] = React.useState(() => ({
    claims,
    rows: lobbyDisagreements(claims ?? [], member.user_id),
  }));
  let rows = shown.rows;
  if (shown.claims !== claims) {
    rows = lobbyDisagreements(claims ?? [], member.user_id, shown.rows);
    setShown({ claims, rows });
  }
  const unlisted = Math.max(0, count - rows.length);
  const fresh = rows.filter(entry => !entry.previouslyDebated);
  const debated = rows.filter(entry => entry.previouslyDebated);
  const [showDebated, setShowDebated] = React.useState(false);
  const debatedListId = React.useId();

  const renderRows = (entries: LobbyDisagreement[]) => (
    <ul className="flex flex-col">
      {entries.map(entry => (
        <li key={entry.row.claim.id} className="border-t border-grey-01 first:border-t-0">
          <DisagreementRow lobbyId={lobby.lobby_id} member={member} entry={entry} />
        </li>
      ))}
    </ul>
  );

  return (
    <div
      role="group"
      aria-label={LOBBY_DISAGREEMENTS_COPY.heading(name)}
      // No scroll of its own: the menu and the sheet each scroll their content, and a nested scroller
      // inside the menu's wheel trap could not be wheeled.
      className="flex flex-col text-left"
      data-testid="lobby-disagreements"
    >
      <Text as="p" variant="metadataMedium" className="px-3 pt-3 pb-1">
        {LOBBY_DISAGREEMENTS_COPY.heading(name)}
      </Text>
      <div className="px-3 pb-3">
        <HubQueryState
          analyticsSurface="hub"
          isLoading={query.isLoading}
          error={query.error}
          failureReason={query.failureReason}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyMessage={LOBBY_DISAGREEMENTS_COPY.unlisted(count, false)}
          loadingFallback={<HubSkeleton rows={2} />}
        >
          {fresh.length > 0 ? (
            renderRows(fresh)
          ) : debated.length > 0 ? (
            <Text as="p" variant="footnote" color="grey-04" className="py-2">
              You and {name} have already debated all the claims listed here.
            </Text>
          ) : null}
          {debated.length > 0 ? (
            <div className="border-t border-grey-01">
              <button
                type="button"
                aria-expanded={showDebated}
                aria-controls={debatedListId}
                {...debateActionAnalyticsAttributes(
                  'hub',
                  showDebated ? 'Lobby already debated collapse' : 'Lobby already debated expand'
                )}
                onClick={() => setShowDebated(value => !value)}
                className="w-full py-2.5 text-left text-button text-grey-04 hover:text-text"
              >
                {showDebated ? 'See less' : 'See more'} · Already debated ({debated.length})
              </button>
              <div id={debatedListId}>{showDebated ? renderRows(debated) : null}</div>
            </div>
          ) : null}
          {unlisted > 0 ? (
            <Text as="p" variant="footnote" color="grey-04" className="pt-1">
              {LOBBY_DISAGREEMENTS_COPY.unlisted(unlisted, true)}
            </Text>
          ) : null}
        </HubQueryState>
      </div>
    </div>
  );
}

function DisagreementRow({
  lobbyId,
  member,
  entry,
}: {
  lobbyId: string;
  member: DebateLobbyMember;
  entry: LobbyDisagreement;
}) {
  const name = personName(member);
  const claim = React.useMemo(() => lobbyRoomClaimFrom(entry.row), [entry.row]);
  // The side being published wins over geo-chat's cached one, as on the room's claim cards. The
  // chain is read only for a withdrawn row, the one case this offer uses it for; a missing intent
  // falls back to refreshing readiness, and the claim's card shares the cache when it has read it.
  const { viewerPosition, indexedPosition, indexingDelayed } = useLobbyViewerPosition(
    claim.claim,
    claim.readiness,
    claim.readiness.readiness_disabled_reason === 'claim_response_withdrawn'
  );
  // A side geo-chat holds but hasn't marked ready can't be requested on, and the claim's card that
  // would repair it may not be mounted; the repair is idempotent, so both may run it.
  useBackfillReadinessForHeldPosition({
    readiness: claim.readiness,
    entityId: claim.claim.claim_entity_id,
    spaceId: claim.claim.space_id,
    indexedPosition,
  });
  // Latched once offered: a refusal refreshes the list, which can clear `requestable`, and
  // unmounting the control then would drop the refusal before anyone read it.
  const [offered, setOffered] = React.useState(entry.requestable);
  if (entry.requestable && !offered) setOffered(true);

  return (
    <div className="flex flex-col gap-2 py-2.5" data-testid="lobby-disagreement">
      <Text as="p" variant="metadataMedium" className="line-clamp-3">
        {entry.row.claim.claim}
      </Text>
      {entry.previouslyDebated ? (
        <Text as="p" variant="footnote" color="grey-04">
          Already debated together
        </Text>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="p" variant="footnote" color="grey-04">
          You: {entry.viewerLabel} · {name}: {entry.theirLabel}
        </Text>
        {offered && viewerPosition !== null ? (
          <LobbyClaimRequest
            lobbyId={lobbyId}
            recipientUserId={member.user_id}
            unavailableReason={entry.requestable ? null : RECIPIENT_UNAVAILABLE_MESSAGE}
            offer={{
              entry: claim,
              viewerPosition,
              requestableCount: 1,
              indexedPosition,
              indexingDelayed,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
