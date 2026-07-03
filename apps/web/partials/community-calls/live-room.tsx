'use client';

import {
  ChatIcon,
  DisconnectButton,
  GridLayout,
  LiveKitRoom,
  MediaDeviceMenu,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { Track } from 'livekit-client';
import { useRouter } from 'next/navigation';

import {
  endCall,
  getCommunityCallToken,
  getViewerToken,
  listRecordings,
  startRecording,
  stopRecording,
} from '~/core/community-calls/api';
import { LAST_EDITOR_CONFIRM_DELAY_MS } from '~/core/community-calls/constants';
import { Recording, parseParticipantMetadata } from '~/core/community-calls/types';
import { useCallTimeUp } from '~/core/community-calls/use-call-time-up';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import { ChatEntry, usePersistentChat } from '~/core/community-calls/use-persistent-chat';
import { useReconnectionState } from '~/core/community-calls/use-reconnection-state';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Member } from '~/design-system/icons/member';

import { CallEndTimer } from './call-end-timer';
import { ChatPanel } from './chat-panel';
import { FocusStage } from './focus-stage';
import { LeaveCallDialog } from './leave-call-dialog';
import { ParticipantsPanel } from './participants-panel';
import { ReactionsButton, ReactionsOverlay, useReactions } from './reactions';
import { ReconnectionOverlay } from './reconnection-overlay';
import { RecordingPlayer } from './recording-player';

type Props = {
  token: string;
  url: string;
  roomName: string;
  spaceName: string;
  isEditor: boolean;
  isViewer: boolean;
  spaceId: string;
  callId: string;
  occurrenceStart: number;
  /** The occurrence's scheduled end (epoch ms) — drives the call-end countdown banner. */
  occurrenceEnd?: number;
  audio: boolean;
  video: boolean;
  backHref: string;
};

/** The live LiveKit room: participant grid + chat/participants sidebar + controls. */
export function LiveRoom({
  token,
  url,
  roomName,
  spaceName,
  isEditor,
  isViewer,
  spaceId,
  callId,
  occurrenceStart,
  occurrenceEnd,
  audio,
  video,
  backHref,
}: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect
      audio={audio}
      video={video}
      data-lk-theme="default"
      // @livekit/components-styles ships its own `.lk-room-container { height: ... }`
      // rule that otherwise wins the cascade over this plain Tailwind class (it's
      // injected after Tailwind's utilities), collapsing the room to its content's
      // intrinsic height instead of filling the viewport — `!` forces `!important`.
      // 100vh (not just the available height below the sticky navbar, see
      // explore-side-panel.tsx) would overflow the viewport by the navbar's height.
      className="flex h-[calc(100dvh-2.75rem)]! flex-col bg-white"
    >
      <RoomBody
        spaceName={spaceName}
        isEditor={isEditor}
        isViewer={isViewer}
        spaceId={spaceId}
        callId={callId}
        roomName={roomName}
        livekitToken={token}
        occurrenceStart={occurrenceStart}
        occurrenceEnd={occurrenceEnd}
        backHref={backHref}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

type SidebarTab = 'chat' | 'people';

function RoomBody({
  spaceName,
  isEditor,
  isViewer,
  roomName,
  livekitToken,
  spaceId,
  callId,
  occurrenceStart,
  occurrenceEnd,
  backHref,
}: {
  spaceName: string;
  isEditor: boolean;
  isViewer: boolean;
  roomName: string;
  livekitToken: string;
  spaceId: string;
  callId: string;
  occurrenceStart: number;
  occurrenceEnd?: number;
  backHref: string;
}) {
  const router = useRouter();
  // withPlaceholder gives camera-off participants an avatar tile with a name label.
  // Viewers never publish camera, and shouldn't take up a placeholder tile — screen
  // share stays visible for everyone regardless of role.
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const tracks = allTracks.filter(
    t => t.source === Track.Source.ScreenShare || !t.participant.identity?.startsWith('Viewer_')
  );

  // A screen share always wins the "main stage" slot in focus mode — instant,
  // no manual pinning needed.
  const isFocusMode = tracks.some(t => t.source === Track.Source.ScreenShare);

  const participants = useParticipants();
  const watchers = participants.filter(p => p.identity?.startsWith('Viewer_')).length;
  const speakers = participants.length - watchers;
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab | null>('chat');
  const { floaters, sendReaction } = useReactions();
  const isMobile = useIsMobileCallLayout();

  const room = useRoomContext();
  const { getToken } = useCommunityCallIdentityToken();
  const [recording, setRecording] = React.useState(false);
  const [egressId, setEgressId] = React.useState<string | null>(null);
  const isActiveEditor = isEditor && !isViewer;
  const canControlRecording = isActiveEditor && Boolean(egressId);

  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [endCallBusy, setEndCallBusy] = React.useState(false);

  // Distinguishes an intentional Leave (CLIENT_INITIATED) — navigate away directly —
  // from a drop that should show the reconnection overlay instead of silently
  // kicking the user out. See use-reconnection-state.ts.
  const reconnection = useReconnectionState(room, () => router.push(backHref));
  const [rejoinBusy, setRejoinBusy] = React.useState(false);
  const [rejoinError, setRejoinError] = React.useState<string | null>(null);

  const handleRejoin = async () => {
    if (rejoinBusy) return;
    setRejoinBusy(true);
    setRejoinError(null);
    try {
      if (isViewer) {
        const { token: newToken, url: newUrl } = await getViewerToken({ spaceId, callId });
        await room.connect(newUrl, newToken);
      } else {
        const identity = await getToken();
        if (!identity) throw new Error('Sign in to rejoin.');
        const { token: newToken, url: newUrl } = await getCommunityCallToken({ spaceId, callId }, identity);
        await room.connect(newUrl, newToken);
      }
      reconnection.reset();
    } catch {
      setRejoinError('Failed to rejoin. Please try again.');
    } finally {
      setRejoinBusy(false);
    }
  };

  // Lifted up (not called from within ChatPanel) so unread tracking keeps running
  // while the panel is hidden or showing the People tab instead of Chat.
  const [hasUnreadMessages, setHasUnreadMessages] = React.useState(false);
  const { messages: chatMessages, send: sendChat } = usePersistentChat({
    spaceId,
    callId,
    occurrenceStart,
    roomName,
    userIdentity: room.localParticipant.identity,
    isChatVisible: sidebarTab === 'chat',
    onNewMessage: () => setHasUnreadMessages(true),
  });

  const openSidebarTab = (tab: SidebarTab | null) => {
    setSidebarTab(tab);
    if (tab === 'chat') setHasUnreadMessages(false);
  };

  // Sidebar starts closed on mobile — desktop's chat-open-by-default doesn't fit a
  // viewport this narrow. Only fires on the desktop->mobile transition, not every
  // render, so a mobile user can still open the sheet afterward.
  React.useEffect(() => {
    if (isMobile) setSidebarTab(null);
  }, [isMobile]);

  // Debounced "am I the only editor left" check — see LAST_EDITOR_CONFIRM_DELAY_MS doc.
  const editorCount = participants.filter(p => parseParticipantMetadata(p.metadata).isEditor).length;
  const isOnlyEditor = isActiveEditor && editorCount === 1;
  const [isLastEditor, setIsLastEditor] = React.useState(false);
  React.useEffect(() => {
    if (!isOnlyEditor) {
      setIsLastEditor(false);
      return;
    }
    const id = window.setTimeout(() => setIsLastEditor(true), LAST_EDITOR_CONFIRM_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isOnlyEditor]);

  const onLeave = () => {
    setLeaveDialogOpen(false);
    room.disconnect();
  };

  // The fullscreen overlay's Leave button must go through the same confirmation
  // dialog as the main control bar's — an editor leaving mid-screen-share is
  // exactly when the last-editor warning matters most. Viewers skip the dialog
  // here too, matching their plain DisconnectButton in the main control bar.
  const onFocusStageLeaveClick = () => {
    if (isViewer) {
      onLeave();
    } else {
      setLeaveDialogOpen(true);
    }
  };

  // Forced-timeout path: fires once when the CallEndTimer banner counts down to
  // zero, converging on the same disconnect + navigate-away cleanup as the manual
  // leave dialog. No recording-stop confirmation on this path — the call ends
  // regardless of whether a recording is still running.
  const handleTimeUp = useCallTimeUp(room, onLeave);

  const onStopRecordingAndLeave = async () => {
    if (endCallBusy) return;
    setEndCallBusy(true);
    try {
      const token = await getToken();
      if (token && egressId) {
        await stopRecording({ egressId, room: roomName }, token).catch(() => {});
        setRecording(false);
        setEgressId(null);
      }
      onLeave();
    } finally {
      setEndCallBusy(false);
    }
  };

  const onEndCallForEveryone = async () => {
    if (endCallBusy) return;
    setEndCallBusy(true);
    try {
      const token = await getToken();
      if (token) {
        // Best-effort stop recording before ending — the call is ending
        // regardless, so a transient failure here shouldn't block it.
        if (canControlRecording && egressId) {
          await stopRecording({ egressId, room: roomName }, token).catch(() => {});
        }
        await endCall({ room: roomName }, token).catch(() => {});
      }
      onLeave();
    } finally {
      setEndCallBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-center gap-2 bg-black py-2 text-metadataMedium text-white">
        {spaceName} community call
        <span className="flex items-center gap-1 text-red-01">
          <span className="size-1.5 animate-pulse rounded-full bg-red-01" />
          LIVE
        </span>
      </div>

      {occurrenceEnd !== undefined && (
        <div className="px-3 pt-3">
          <CallEndTimer endTime={new Date(occurrenceEnd)} onTimeUp={handleTimeUp} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1 p-3">
          <TrackedErrorBoundary
            fallback={
              <p className="flex h-full items-center justify-center text-metadata text-grey-04">Video unavailable</p>
            }
          >
            {isFocusMode ? (
              <FocusStage tracks={tracks} isViewer={isViewer} onLeave={onFocusStageLeaveClick} />
            ) : (
              <GridLayout tracks={tracks} className="[&_.lk-participant-tile]:max-h-[420px]">
                <ParticipantTile />
              </GridLayout>
            )}
          </TrackedErrorBoundary>
          <ReactionsOverlay floaters={floaters} />
        </div>
        {!isMobile && sidebarTab && (
          <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-grey-02">
            <SidebarContent
              sidebarTab={sidebarTab}
              hasUnreadMessages={hasUnreadMessages}
              openSidebarTab={openSidebarTab}
              chatMessages={chatMessages}
              sendChat={sendChat}
              isViewer={isViewer}
              roomName={roomName}
              livekitToken={livekitToken}
              canModerate={isActiveEditor}
            />
          </aside>
        )}
      </div>

      {/* On mobile the inline sidebar doesn't fit — chat/people become a slide-up
          sheet instead, same panels, opened from the same toggle buttons below. */}
      {isMobile && (
        <MobileSidebarSheet
          open={sidebarTab !== null}
          onOpenChange={open => openSidebarTab(open ? (sidebarTab ?? 'chat') : null)}
          title={sidebarTab === 'people' ? 'Participants' : 'Chat'}
        >
          <SidebarContent
            sidebarTab={sidebarTab ?? 'chat'}
            hasUnreadMessages={hasUnreadMessages}
            openSidebarTab={openSidebarTab}
            chatMessages={chatMessages}
            sendChat={sendChat}
            isViewer={isViewer}
            roomName={roomName}
            livekitToken={livekitToken}
            canModerate={isActiveEditor}
          />
        </MobileSidebarSheet>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-grey-02 px-4 py-3">
        <div className="flex items-center gap-2">
          {isActiveEditor && (
            <RecordButton
              roomName={roomName}
              recording={recording}
              egressId={egressId}
              onRecordingChange={(next, nextEgressId) => {
                setRecording(next);
                setEgressId(nextEgressId);
              }}
            />
          )}
        </div>
        {!isViewer && (
          <div className="flex items-center gap-2">
            <div className="lk-button-group">
              <TrackToggle source={Track.Source.Microphone} />
              <div className="lk-button-group-menu">
                <MediaDeviceMenu kind="audioinput" />
              </div>
            </div>
            <div className="lk-button-group">
              <TrackToggle source={Track.Source.Camera} />
              <div className="lk-button-group-menu">
                <MediaDeviceMenu kind="videoinput" />
              </div>
            </div>
            <TrackToggle source={Track.Source.ScreenShare} />
            <ReactionsButton onSend={sendReaction} />
            <button
              onClick={() => setLeaveDialogOpen(true)}
              className="rounded-md bg-red-01 px-3 py-2 text-metadataMedium text-white"
            >
              Leave
            </button>
          </div>
        )}
        {isViewer && (
          <DisconnectButton className="rounded-md bg-red-01 px-3 py-2 text-metadataMedium text-white">
            Leave
          </DisconnectButton>
        )}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-metadata text-grey-04">
            <div className="flex -space-x-1.5">
              {participants.slice(0, 4).map(p => (
                <span key={p.identity} className="size-5 overflow-hidden rounded-full ring-1 ring-white">
                  <Avatar value={p.name || p.identity} size={20} />
                </span>
              ))}
            </div>
            {speakers} participants · {watchers} watchers
          </div>
          <button
            onClick={() => openSidebarTab(sidebarTab ? null : 'chat')}
            aria-label={
              hasUnreadMessages ? 'Show sidebar (new chat messages)' : sidebarTab ? 'Hide sidebar' : 'Show sidebar'
            }
            className="relative flex size-8 items-center justify-center rounded-md bg-grey-01 text-grey-04"
          >
            <ChatIcon />
            {hasUnreadMessages && (
              <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-grey-01 bg-red-01" />
            )}
          </button>
        </div>
      </div>

      <LeaveCallDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        isEditor={isActiveEditor}
        isLastEditor={isLastEditor}
        isRecording={recording}
        canControlRecording={canControlRecording}
        endCallBusy={endCallBusy}
        onLeave={onLeave}
        onEndCallForEveryone={onEndCallForEveryone}
        onStopRecordingAndLeave={onStopRecordingAndLeave}
      />

      <ReconnectionOverlay
        status={reconnection.status}
        disconnectReason={reconnection.disconnectReason}
        onRejoin={handleRejoin}
        onLeave={() => router.push(backHref)}
        rejoinBusy={rejoinBusy}
        rejoinError={rejoinError}
      />
    </div>
  );
}

/** Chat/People tab switcher + panel — shared between the desktop inline sidebar and the mobile sheet. */
function SidebarContent({
  sidebarTab,
  hasUnreadMessages,
  openSidebarTab,
  chatMessages,
  sendChat,
  isViewer,
  roomName,
  livekitToken,
  canModerate,
}: {
  sidebarTab: SidebarTab;
  hasUnreadMessages: boolean;
  openSidebarTab: (tab: SidebarTab | null) => void;
  chatMessages: ChatEntry[];
  sendChat: (content: string) => Promise<void>;
  isViewer: boolean;
  roomName: string;
  livekitToken: string;
  canModerate: boolean;
}) {
  return (
    <>
      <div className="flex border-b border-grey-02">
        <SidebarTabButton
          label="Chat"
          active={sidebarTab === 'chat'}
          hasUnread={hasUnreadMessages}
          onClick={() => openSidebarTab('chat')}
        />
        <SidebarTabButton label="People" active={sidebarTab === 'people'} onClick={() => openSidebarTab('people')} />
      </div>
      <div className="flex-1 overflow-hidden">
        {sidebarTab === 'chat' ? (
          <ChatPanel messages={chatMessages} send={sendChat} isViewer={isViewer} />
        ) : (
          <ParticipantsPanel roomName={roomName} livekitToken={livekitToken} canModerate={canModerate} />
        )}
      </div>
    </>
  );
}

/** Slide-up sheet for the Chat/People panels on narrow viewports — the 320px inline sidebar doesn't fit. */
function MobileSidebarSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-x-0 bottom-0 z-101 flex max-h-[80vh] flex-col overflow-hidden rounded-t-lg bg-white focus:outline-hidden">
          <Title className="sr-only">{title}</Title>
          {children}
        </Content>
      </Portal>
    </Root>
  );
}

function SidebarTabButton({
  label,
  active,
  hasUnread = false,
  onClick,
}: {
  label: string;
  active: boolean;
  hasUnread?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-center text-metadataMedium ${active ? 'border-b-2 border-text text-text' : 'text-grey-04'}`}
    >
      {label === 'People' ? (
        <span className="inline-flex items-center gap-1">
          <Member /> {label}
        </span>
      ) : (
        <span className="relative inline-flex items-center">
          {label}
          {hasUnread && <span className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-red-01" />}
        </span>
      )}
    </button>
  );
}

function RecordButton({
  roomName,
  recording,
  egressId,
  onRecordingChange,
}: {
  roomName: string;
  // Lifted to RoomBody (not room-metadata-synced — other clients won't see the
  // recording flag flip) so the leave-call dialog can offer "stop & leave".
  recording: boolean;
  egressId: string | null;
  onRecordingChange: (recording: boolean, egressId: string | null) => void;
}) {
  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const [busy, setBusy] = React.useState(false);
  const [roomRecordings, setRoomRecordings] = React.useState<Recording[]>([]);

  const loadRecordings = React.useCallback(async () => {
    if (!identityToken) return;
    const token = await getToken();
    if (!token) return;
    const { recordings } = await listRecordings(token);
    setRoomRecordings(recordings.filter(r => r.roomName === roomName));
  }, [identityToken, getToken, roomName]);

  React.useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const toggle = async () => {
    if (!identityToken || busy) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      if (recording && egressId) {
        await stopRecording({ egressId, room: roomName }, token);
        onRecordingChange(false, null);
        await loadRecordings();
      } else {
        const { egressId: newEgressId } = await startRecording({ room: roomName }, token);
        onRecordingChange(true, newEgressId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant={recording ? 'error' : 'secondary'} disabled={busy} onClick={toggle}>
        {recording ? 'Stop recording' : 'Record'}
      </Button>
      {!recording && roomRecordings.length > 0 && (
        <Dialog
          trigger={<Button variant="secondary">Review</Button>}
          header={<span className="text-smallTitle">Recordings</span>}
          content={<RecordingPlayer recordings={roomRecordings} />}
        />
      )}
    </div>
  );
}
