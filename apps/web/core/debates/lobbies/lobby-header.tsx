'use client';

import * as React from 'react';

import cx from 'classnames';

import { useActionContext } from '~/core/action-context-provider';
import { copyShareLink } from '~/core/sharing/share-handoff';
import { createShareLink } from '~/core/sharing/share-link';
import {
  EndCallPublishChoice,
  callRecordingMetaLabel,
  useEndCallPublishes,
} from '~/core/space-calls/recording/call-recording-room';
import { spaceCallPath } from '~/core/space-calls/routes';

import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Text } from '~/design-system/text';

import { debateActionAnalyticsAttributes, debateSurfaceAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { EditLobbyButton, canEditLobby } from './edit-lobby-dialog';
import { useEndDebateLobby } from './hooks';
import { lobbyShareUrl } from './lobby-analytics';
import {
  debatingCount,
  debatingLabel,
  hereLabel,
  hostsLabel,
  isHosting,
  lobbyErrorMessage,
  lobbyHeadcount,
  raisedHands,
} from './lobby-format';
import { LobbyHostLists } from './lobby-moderation';
import { LobbyPopup } from './lobby-popup';
import { useLobbyRoomPurpose } from './lobby-purpose';
import { type LobbyPageView, type MemberLobbyPageView, isMemberView } from './lobby-view';

export const LOBBY_HEADER_COPY = {
  breadcrumb: 'Debates / Lobbies',
  copyLink: 'Copy link',
  copied: 'Link copied',
  endLobby: 'End lobby',
  endForEveryone: 'End for everyone',
  raisedHands: (count: number) => `Raised hands · ${count}`,
  callBreadcrumb: (space: string | null) => `${space ?? 'Space'} / Calls`,
  endCall: 'End call',
} as const;

/** "Hosted by Adam and Priya · Video on · Not recorded". */
export function lobbyMetaLabel(lobby: Pick<LobbyPageView, 'members'>) {
  const hosts = hostsLabel(lobby.members.filter(isHosting));
  return [hosts ? `Hosted by ${hosts}` : 'No host here', 'Video on', 'Not recorded'].join(' · ');
}

/** "Hosted by Adam and Priya · Recording", for a space call; no recording part when geo-chat sends none. */
export function callMetaLabel(lobby: Pick<LobbyPageView, 'members'>, recording: string | null = null) {
  const hosts = hostsLabel(lobby.members.filter(isHosting));
  return [hosts ? `Hosted by ${hosts}` : 'No host here', recording].filter(Boolean).join(' · ');
}

function useCopyLink(lobbyId: string) {
  const getContext = useActionContext('share_dialog', 'lobby', lobbyId);
  const purpose = useLobbyRoomPurpose();
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    const url =
      purpose.purpose === 'call'
        ? `${window.location.origin}${spaceCallPath(purpose.spaceId, lobbyId)}`
        : lobbyShareUrl(lobbyId);
    try {
      await copyShareLink(createShareLink(url, 'lobby', lobbyId, 'copy_link'), getContext());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
}

/**
 * The lobby's header. Desktop: breadcrumb, title, Live, who hosts, then Copy link, the availability
 * pill, a host's Raised hands and End lobby. Phone: a smaller title with a "…" menu and Live.
 */
export function LobbyHeader({
  lobby,
  phone,
  availability,
}: {
  lobby: LobbyPageView;
  phone: boolean;
  /** The availability pill; on a phone it sits in the bottom bar instead. */
  availability: React.ReactNode;
}) {
  const memberLobby = isMemberView(lobby) && lobby.viewer.hosting ? lobby : null;
  const hostLists = memberLobby ? <LobbyHostListsChip lobby={memberLobby} /> : null;
  const call = useLobbyRoomPurpose().purpose === 'call';
  const recordingLabel = callRecordingMetaLabel(lobby);

  if (phone) {
    return (
      <header className="flex flex-col gap-1.5 px-4 pt-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 text-[22px] leading-[26px] font-semibold tracking-[-0.25px]">{lobby.name}</h1>
          <LobbyTitleMenu lobby={lobby} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LivePill lobby={lobby} small />
          {hostLists}
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-grey-02 px-8 py-4">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
        <Text as="p" variant="footnoteMedium" color="grey-04">
          {call ? LOBBY_HEADER_COPY.callBreadcrumb(lobby.call?.space_name ?? null) : LOBBY_HEADER_COPY.breadcrumb}
        </Text>
        <div className="flex flex-wrap items-center gap-3">
          <Text as="h1" variant="largeTitle">
            {lobby.name}
          </Text>
          <LivePill lobby={lobby} />
        </div>
        <Text as="p" variant="metadata" color="grey-04">
          {call ? callMetaLabel(lobby, recordingLabel) : lobbyMetaLabel(lobby)}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hostLists}
        <EditLobbyButton lobby={lobby} />
        <CopyLinkButton lobbyId={lobby.lobby_id} />
        {availability}
        {lobby.viewer.hosting ? <EndLobbyControl lobby={lobby} /> : null}
      </div>
    </header>
  );
}

function LivePill({ lobby, small = false }: { lobby: LobbyPageView; small?: boolean }) {
  const call = useLobbyRoomPurpose().purpose === 'call';
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green/15 font-medium text-[#127A5B]',
        small ? 'px-2 py-1 text-[14px] leading-[18px]' : 'px-2.5 py-1.5 text-metadata'
      )}
    >
      <span aria-hidden className={cx('rounded-full bg-green', small ? 'size-1.5' : 'size-2')} />
      Live · {hereLabel(lobbyHeadcount(lobby))}
      {call ? null : ` · ${debatingLabel(debatingCount(lobby.members))}`}
    </span>
  );
}

function CopyLinkButton({ lobbyId }: { lobbyId: string }) {
  const { copied, copy } = useCopyLink(lobbyId);
  return (
    <HubPillButton analyticsLabel="Lobby copy link" onClick={() => void copy()}>
      <span className="inline-flex items-center gap-1.5">
        <LinkIcon />
        {copied ? LOBBY_HEADER_COPY.copied : LOBBY_HEADER_COPY.copyLink}
      </span>
    </HubPillButton>
  );
}

function EndLobbyControl({ lobby }: { lobby: LobbyPageView }) {
  const end = useEndDebateLobby(lobby.lobby_id);
  const [confirming, setConfirming] = React.useState(false);
  const call = useLobbyRoomPurpose().purpose === 'call';
  // A call editor's choice to publish its recording (GEO-3421); sent only while it can be made.
  const [publishRecording, setPublishRecording] = React.useState(false);
  const publishes = useEndCallPublishes(lobby) && publishRecording;

  return (
    <>
      {confirming ? (
        <>
          <EndCallPublishChoice lobby={lobby} checked={publishRecording} onChange={setPublishRecording} />
          <HubPillButton
            variant="primary"
            analyticsLabel="Lobby end confirm"
            pending={end.isPending}
            pendingLabel="Ending…"
            onClick={() => end.mutate({ publishRecording: publishes })}
          >
            {LOBBY_HEADER_COPY.endForEveryone}
          </HubPillButton>
          <HubPillButton analyticsLabel="Lobby end cancel" onClick={() => setConfirming(false)}>
            Cancel
          </HubPillButton>
        </>
      ) : (
        <HubPillButton
          analyticsLabel="Lobby end"
          onClick={() => setConfirming(true)}
          className="border-red-03 text-[#D9341C]"
        >
          {call ? LOBBY_HEADER_COPY.endCall : LOBBY_HEADER_COPY.endLobby}
        </HubPillButton>
      )}
      {end.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="basis-full">
          {lobbyErrorMessage(end.error, `Could not end the ${call ? 'call' : 'lobby'}. Try again.`)}
        </Text>
      ) : null}
    </>
  );
}

/** Phone: Copy link and, for a host, Edit lobby and End lobby behind the title's "…". */
function LobbyTitleMenu({ lobby }: { lobby: LobbyPageView }) {
  const [open, setOpen] = React.useState(false);
  const title = useLobbyRoomPurpose().purpose === 'call' ? 'Call options' : 'Lobby options';

  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      title={title}
      trigger={
        <button
          type="button"
          aria-label={title}
          {...debateActionAnalyticsAttributes('hub', 'Lobby options')}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-grey-04 hover:bg-grey-01 hover:text-text"
        >
          <Ellipsis />
        </button>
      }
    >
      <div className="flex flex-col gap-2 pb-1">
        <CopyLinkRow lobbyId={lobby.lobby_id} />
        {lobby.viewer.hosting || canEditLobby(lobby) ? (
          <div className="flex flex-wrap gap-2">
            <EditLobbyButton lobby={lobby} />
            {lobby.viewer.hosting ? <EndLobbyControl lobby={lobby} /> : null}
          </div>
        ) : null}
      </div>
    </LobbyPopup>
  );
}

function CopyLinkRow({ lobbyId }: { lobbyId: string }) {
  const { copied, copy } = useCopyLink(lobbyId);
  return (
    <button
      type="button"
      data-geo-analytics-label="Lobby copy link"
      data-geo-analytics-intent={debateSurfaceAnalyticsAttributes('hub', 'action')['data-geo-analytics-intent']}
      onClick={() => void copy()}
      className="flex h-11 w-full items-center gap-2.5 text-left text-[17px] text-text"
    >
      <LinkIcon />
      {copied ? LOBBY_HEADER_COPY.copied : LOBBY_HEADER_COPY.copyLink}
    </button>
  );
}

/** A host's way into raised hands, the banned list and the log. */
function LobbyHostListsChip({ lobby }: { lobby: MemberLobbyPageView }) {
  const [open, setOpen] = React.useState(false);
  const hands = raisedHands(lobby.members).length;

  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      title="Host lists"
      wide
      trigger={
        <button
          type="button"
          {...debateActionAnalyticsAttributes('hub', 'Lobby host lists', 'open_lobby_host_controls')}
          className={cx(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-metadata whitespace-nowrap transition-colors',
            hands > 0 ? 'border-ctaPrimary bg-ctaTertiary text-ctaPrimary' : 'border-grey-02 text-text hover:bg-grey-01'
          )}
        >
          {LOBBY_HEADER_COPY.raisedHands(hands)}
        </button>
      }
    >
      <div className="p-1.5">
        <LobbyHostLists lobby={lobby} />
      </div>
    </LobbyPopup>
  );
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}
