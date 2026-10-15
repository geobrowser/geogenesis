'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { type DebateLobbyClaim, type DebateLobbyMember, dashlessId } from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { personName } from './lobby-format';
import { LobbyPopup } from './lobby-popup';
import { LobbyClaimRequest, lobbyRoomClaimFrom } from './lobby-room-claims';
import { useDebateLobbyClaims } from './lobby-room-claims-hooks';
import type { LobbyPageView } from './lobby-view';

export const LOBBY_DISAGREEMENTS_COPY = {
  disagreesOn: (count: number) => `Disagrees on ${count}`,
  heading: (name: string) => `You and ${name} disagree on`,
  loading: 'Loading claims…',
  /** geo-chat lists at most 8 people per side, so a busy claim can leave someone off its list. */
  unlisted: (count: number) => `${count} more ${count === 1 ? 'claim isn’t' : 'claims aren’t'} listed here.`,
  none: 'These claims aren’t listed here yet.',
} as const;

/** A claim the viewer and one person hold opposite sides on, with the request that person can take. */
export type LobbyDisagreement = {
  row: DebateLobbyClaim;
  viewerLabel: string;
  theirLabel: string;
  /** Whether a lobby-scoped request can go to them on this claim now. */
  requestable: boolean;
};

/**
 * The room's claims where the viewer holds one side and `userId` is listed on the other, in the
 * server's order. Each side lists at most 8 people, so this can fall short of the count geo-chat
 * gives in `disagreements`.
 */
export function lobbyDisagreements(claims: DebateLobbyClaim[], userId: string): LobbyDisagreement[] {
  const id = dashlessId(userId);
  return claims.flatMap(row => {
    const viewer = row.viewer_response;
    if (!viewer) return [];
    const theirs = row.positions.find(side => side.position !== viewer.position);
    const person = theirs?.participants.find(participant => dashlessId(participant.user_id) === id);
    if (!theirs || !person) return [];
    return [
      { row, viewerLabel: viewer.position_label, theirLabel: theirs.position_label, requestable: person.requestable },
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
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  count: number;
  /** `pill` on desktop, `line` for a phone tile's one status line. */
  variant: 'pill' | 'line';
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
          aria-label={`${label} claims with ${name}`}
          {...debateActionAnalyticsAttributes('hub', 'Lobby disagreements')}
          data-testid="lobby-disagreements-trigger"
          // Above the tile's stretched person button, which covers the rest of the tile.
          className={cx(
            'relative z-10 max-w-full font-medium whitespace-nowrap text-[#C42D17]',
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
  const rows = React.useMemo(
    () => lobbyDisagreements(query.data?.claims ?? [], member.user_id),
    [query.data?.claims, member.user_id]
  );
  const unlisted = Math.max(0, count - rows.length);

  return (
    <div
      role="group"
      aria-label={LOBBY_DISAGREEMENTS_COPY.heading(name)}
      className="flex max-h-[60vh] flex-col overflow-y-auto"
      data-testid="lobby-disagreements"
    >
      <Text as="p" variant="metadataMedium" className="px-3 pt-3 pb-1">
        {LOBBY_DISAGREEMENTS_COPY.heading(name)}
      </Text>
      {query.isLoading ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-3 py-2">
          {LOBBY_DISAGREEMENTS_COPY.loading}
        </Text>
      ) : rows.length === 0 ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-3 py-2">
          {LOBBY_DISAGREEMENTS_COPY.none}
        </Text>
      ) : (
        <ul className="flex flex-col">
          {rows.map(entry => (
            <li key={entry.row.claim.id} className="border-t border-grey-01 first:border-t-0">
              <DisagreementRow lobbyId={lobby.lobby_id} member={member} entry={entry} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && unlisted > 0 ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-3 pb-3">
          {LOBBY_DISAGREEMENTS_COPY.unlisted(unlisted)}
        </Text>
      ) : null}
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
  const viewerPosition = entry.row.viewer_response?.position ?? null;

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5" data-testid="lobby-disagreement">
      <Text as="p" variant="metadataMedium" className="line-clamp-3">
        {entry.row.claim.claim}
      </Text>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="p" variant="footnote" color="grey-04">
          You: {entry.viewerLabel} · {name}: {entry.theirLabel}
        </Text>
        {entry.requestable && viewerPosition !== null ? (
          <LobbyClaimRequest
            lobbyId={lobbyId}
            recipientUserId={member.user_id}
            offer={{
              entry: claim,
              viewerPosition,
              requestableCount: 1,
              indexedPosition: null,
              indexingDelayed: false,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
