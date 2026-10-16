'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { CameraIcon, DebateTileToggleButton, MicrophoneIcon } from './debate-room-controls';
import { DebateVideoTile } from './debate-video-tile';
import { lobbyCaptureLive, releaseLobbyCapture, useLobbyCapture } from './lobbies/step-out';
import { type DebateMediaSession, preJoinMediaFailure, useOptionalDebateMediaSession } from './media-session';
import {
  type DebateJoinState,
  type DebateMediaPermission,
  describeJoinState,
  describeMicOnlyJoinState,
  isMediaBlocked,
  mayAutoStartPreview,
} from './request-join-state';

type DebateMediaPermissions = { camera: DebateMediaPermission; microphone: DebateMediaPermission };

const UNKNOWN_PERMISSIONS: DebateMediaPermissions = { camera: 'unsupported', microphone: 'unsupported' };

async function readMediaPermission(): Promise<DebateMediaPermissions> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return UNKNOWN_PERMISSIONS;

  const ask = async (name: 'camera' | 'microphone'): Promise<DebateMediaPermission> => {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state;
    } catch {
      return 'unsupported';
    }
  };

  const [camera, microphone] = await Promise.all([ask('camera'), ask('microphone')]);
  return { camera, microphone };
}

type DebateRequestMediaPreviewProps = {
  sessionKey: string;
  avatarCid?: string | null;
  avatarValue?: string | null;
  retain?: React.MutableRefObject<boolean>;
  fallback?: React.ReactNode;
  initialJoinState?: DebateJoinState | null;
  onJoinStateChange?: (state: DebateJoinState) => void;
  /** False for a card that leads into an audio-only claim picker: mic only, camera never opened. */
  camera?: boolean;
};

/**
 * Own tile on a request card: a camera preview and the two toggles, beside the other person.
 *
 * It exists because of what happens without it — two people arriving in a call both muted, with no
 * way to tell each other to unmute. Choosing here means the browser's permission prompt lands
 * before the call rather than during it, and the state chosen is the state the room starts in.
 * Split in two so the hooks always run in the same order: this half decides whether there is a
 * session at all, and the half holding the effects is only mounted once there is one.
 */
export function DebateRequestMediaPreview({ fallback, ...props }: DebateRequestMediaPreviewProps) {
  const session = useOptionalDebateMediaSession();
  if (!session) return <>{fallback ?? null}</>;
  return <MediaPreview {...props} session={session} />;
}

function MediaPreview({
  sessionKey,
  avatarCid,
  avatarValue,
  retain,
  initialJoinState = null,
  onJoinStateChange,
  camera = true,
  session,
}: Omit<DebateRequestMediaPreviewProps, 'fallback'> & { session: DebateMediaSession }) {
  const [permission, setPermission] = React.useState<DebateMediaPermissions | null>(null);

  const [want, setWant] = React.useState<DebateJoinState>(initialJoinState ?? { micOn: false, cameraOn: false });
  const [missing, setMissing] = React.useState<{ mic: boolean; camera: boolean }>({ mic: false, camera: false });
  const [failure, setFailure] = React.useState<string | null>(null);

  const chosenByViewer = React.useRef(false);
  const acquired = React.useRef<DebateJoinState>({ micOn: false, cameraOn: false });
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const initialJoinStateRef = React.useRef(initialJoinState);

  // A kind the lobby captures stays the lobby's until toggled here: never opened twice (iPhone Safari
  // keeps one capture per kind), and shown as the lobby has it unless a choice was saved.
  const lobbyMic = useLobbyCapture('audio');
  const lobbyCamera = useLobbyCapture('video');
  const [toggledHere, setToggledHere] = React.useState({ mic: false, camera: false });
  const micToLobby = lobbyMic !== null && !toggledHere.mic;
  const cameraToLobby = lobbyCamera !== null && !toggledHere.camera;
  const followLobby = initialJoinStateRef.current === null;
  const lobbyMicOn = micToLobby && followLobby ? lobbyMic.on : null;
  const lobbyCameraOn = cameraToLobby && followLobby ? lobbyCamera.on : null;
  React.useEffect(() => {
    if (lobbyMicOn === null && lobbyCameraOn === null) return;
    setWant(current => ({
      micOn: lobbyMicOn ?? current.micOn,
      cameraOn: lobbyCameraOn ?? current.cameraOn,
    }));
  }, [lobbyCameraOn, lobbyMicOn]);

  React.useEffect(() => {
    let active = true;
    session.beginSession(sessionKey);

    void readMediaPermission().then(answer => {
      if (!active) return;
      setPermission(answer);

      // Two ways a choice can already exist, and a default applies over neither: one arrived with
      // the card, and one was made here while this query was still out.
      if (initialJoinStateRef.current || chosenByViewer.current) return;
      setWant(current => ({
        micOn: lobbyCaptureLive('audio') ? current.micOn : mayAutoStartPreview(answer.microphone),
        cameraOn: lobbyCaptureLive('video') ? current.cameraOn : mayAutoStartPreview(answer.camera),
      }));
    });

    return () => {
      active = false;
      if (!retain?.current) session.releaseSession(sessionKey);
    };
  }, [sessionKey]);

  const open = { micOn: want.micOn && !micToLobby, cameraOn: camera && want.cameraOn && !cameraToLobby };
  const openKey = `${open.micOn}:${open.cameraOn}`;
  React.useEffect(() => {
    let active = true;

    if (!open.micOn && !open.cameraOn) {
      acquired.current = { micOn: false, cameraOn: false };
      session.stopMedia();
      return;
    }

    void session
      .ensurePreview({ audio: open.micOn, video: open.cameraOn })
      .then(tracks => {
        if (!active) return;
        const kinds = new Set(tracks.map(track => track.mediaStreamTrack.kind));
        acquired.current = { micOn: kinds.has('audio'), cameraOn: kinds.has('video') };
        setMissing(current => ({
          mic: open.micOn ? !kinds.has('audio') : current.mic,
          camera: open.cameraOn ? !kinds.has('video') : current.camera,
        }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        const name = error instanceof Error ? error.name : '';
        if (name === 'NotFoundError') {
          setMissing(current => ({
            mic: open.micOn && !acquired.current.micOn ? true : current.mic,
            camera: open.cameraOn && !acquired.current.cameraOn ? true : current.camera,
          }));
        } else {
          const failed = preJoinMediaFailure(error, camera ? undefined : { audio: true, video: false });
          setFailure(failed.message);

          if (failed.state === 'denied') {
            void readMediaPermission().then(answer => {
              if (!active) return;
              setPermission({
                camera: answer.camera === 'unsupported' && open.cameraOn ? 'denied' : answer.camera,
                microphone: answer.microphone === 'unsupported' && open.micOn ? 'denied' : answer.microphone,
              });
            });
          }
        }

        const fallback = acquired.current;
        const fallbackJustFailed = fallback.micOn === open.micOn && fallback.cameraOn === open.cameraOn;
        const next = fallbackJustFailed ? { micOn: false, cameraOn: false } : fallback;
        setWant(current => ({
          micOn: micToLobby ? current.micOn : next.micOn,
          cameraOn: cameraToLobby ? current.cameraOn : next.cameraOn,
        }));
      });

    return () => {
      active = false;
    };
    // Keyed on the wanted set and session key, not on `session`, whose identity changes on every media event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, openKey]);

  const micOn = want.micOn && !missing.mic;
  const cameraOn = camera && want.cameraOn && !missing.camera;

  // The preview element is fed from the session's stream rather than owning a `getUserMedia` of its
  // own, so there is one camera open between this card and the room it leads to.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = session.previewStream ?? null;
  }, [session.previewStream, cameraOn]);

  // A camera that is not offered is not reported blocked either: there would be nothing to unblock.
  const cameraBlocked = camera && permission !== null && isMediaBlocked(permission.camera);
  const micBlocked = permission !== null && isMediaBlocked(permission.microphone);
  const blocked = cameraBlocked && micBlocked;

  React.useEffect(() => {
    if (permission === null) return;
    onJoinStateChange?.({ micOn, cameraOn });
  }, [cameraOn, micOn, onJoinStateChange, permission]);

  // What the room this session is handed to starts with, rather than reading it off live tracks.
  // After `beginSession`, which clears it; no camera choice where none was offered.
  React.useEffect(() => {
    session.joinChoiceRef.current = camera ? { micOn, cameraOn } : { micOn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, cameraOn, micOn, sessionKey]);

  const toggle = (next: Partial<DebateJoinState>) => {
    if (next.micOn !== undefined && micBlocked) return;
    if (next.cameraOn !== undefined && cameraBlocked) return;
    chosenByViewer.current = true;
    if (next.micOn !== undefined) setToggledHere(current => ({ ...current, mic: true }));
    if (next.cameraOn !== undefined) setToggledHere(current => ({ ...current, camera: true }));
    if (next.micOn) releaseLobbyCapture('audio');
    if (next.cameraOn) releaseLobbyCapture('video');
    setFailure(null);
    setWant(current => ({ ...current, ...next }));
  };

  const { summary, announcement } = camera ? describeJoinState({ micOn, cameraOn }) : describeMicOnlyJoinState(micOn);

  const toggles = blocked ? null : (
    <div className="flex items-center justify-center gap-2">
      {!micBlocked && (
        <DebateTileToggleButton
          ariaLabel={micOn ? 'Turn microphone off' : 'Turn microphone on'}
          compact
          enabled={micOn}
          onClick={() => toggle({ micOn: !micOn })}
        >
          <MicrophoneIcon muted={!micOn} />
        </DebateTileToggleButton>
      )}
      {camera && !cameraBlocked && (
        <DebateTileToggleButton
          ariaLabel={cameraOn ? 'Turn camera off' : 'Turn camera on'}
          compact
          enabled={cameraOn}
          onClick={() => toggle({ cameraOn: !cameraOn })}
        >
          <CameraIcon disabled={!cameraOn} />
        </DebateTileToggleButton>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {cameraOn ? (
        <DebateVideoTile participantPosition={null} active={false} tileLabel="You" inactiveIndicatorId="local">
          <video ref={videoRef} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
        </DebateVideoTile>
      ) : (
        <div className="grid place-items-center py-1">
          <span className="h-5 w-5 overflow-hidden rounded-full">
            <Avatar avatarUrl={avatarCid ?? undefined} value={avatarValue ?? undefined} alt="" size={20} />
          </span>
        </div>
      )}
      {toggles}

      {blocked ? (
        <Text variant="footnote" color="grey-04">
          Camera and mic are blocked for this site. Allow them in your browser&apos;s address bar to turn them on.
        </Text>
      ) : cameraBlocked ? (
        <Text variant="footnote" color="grey-04">
          Camera is blocked for this site. Allow it in your browser&apos;s address bar to turn it on.
        </Text>
      ) : micBlocked ? (
        <Text variant="footnote" color="grey-04">
          Mic is blocked for this site. Allow it in your browser&apos;s address bar to turn it on.
        </Text>
      ) : failure ? (
        <Text variant="footnote" color="grey-04">
          {failure}
        </Text>
      ) : missing.mic && camera && missing.camera ? (
        <Text variant="footnote" color="grey-04">
          No camera or microphone found.
        </Text>
      ) : camera && missing.camera ? (
        <Text variant="footnote" color="grey-04">
          No camera found.
        </Text>
      ) : missing.mic ? (
        <Text variant="footnote" color="grey-04">
          No microphone found.
        </Text>
      ) : null}

      <Text variant="footnote" color="grey-04">
        {summary}
      </Text>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
