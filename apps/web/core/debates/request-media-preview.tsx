'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { CameraIcon, DebateTileToggleButton, MicrophoneIcon } from './debate-room-controls';
import { DebateVideoTile } from './debate-video-tile';
import { type DebateMediaSession, preJoinMediaFailure, useOptionalDebateMediaSession } from './media-session';
import {
  type DebateJoinState,
  type DebateMediaPermission,
  describeJoinState,
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
  session,
}: Omit<DebateRequestMediaPreviewProps, 'fallback'> & { session: DebateMediaSession }) {
  const [permission, setPermission] = React.useState<DebateMediaPermissions | null>(null);

  const [want, setWant] = React.useState<DebateJoinState>({ micOn: false, cameraOn: false });
  const [missing, setMissing] = React.useState<{ mic: boolean; camera: boolean }>({ mic: false, camera: false });
  const [failure, setFailure] = React.useState<string | null>(null);

  const acquired = React.useRef<DebateJoinState>({ micOn: false, cameraOn: false });
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    let active = true;
    session.beginSession(sessionKey);

    void readMediaPermission().then(answer => {
      if (!active) return;
      setPermission(answer);
      setWant({ micOn: mayAutoStartPreview(answer.microphone), cameraOn: mayAutoStartPreview(answer.camera) });
    });

    return () => {
      active = false;
      if (!retain?.current) session.releaseSession(sessionKey);
    };
  }, [sessionKey]);

  const wantKey = `${want.micOn}:${want.cameraOn}`;
  React.useEffect(() => {
    let active = true;

    if (!want.micOn && !want.cameraOn) {
      acquired.current = { micOn: false, cameraOn: false };
      session.stopMedia();
      return;
    }

    void session
      .ensurePreview({ audio: want.micOn, video: want.cameraOn, forceRestart: true })
      .then(tracks => {
        if (!active) return;
        const kinds = new Set(tracks.map(track => track.mediaStreamTrack.kind));
        acquired.current = { micOn: kinds.has('audio'), cameraOn: kinds.has('video') };
        setMissing(current => ({
          mic: want.micOn ? !kinds.has('audio') : current.mic,
          camera: want.cameraOn ? !kinds.has('video') : current.camera,
        }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        const name = error instanceof Error ? error.name : '';
        if (name === 'NotFoundError') {
          setMissing(current => ({
            mic: want.micOn && !acquired.current.micOn ? true : current.mic,
            camera: want.cameraOn && !acquired.current.cameraOn ? true : current.camera,
          }));
        } else {
          const failed = preJoinMediaFailure(error);
          setFailure(failed.message);

          if (failed.state === 'denied') {
            void readMediaPermission().then(answer => {
              if (!active) return;
              setPermission({
                camera: answer.camera === 'unsupported' && want.cameraOn ? 'denied' : answer.camera,
                microphone: answer.microphone === 'unsupported' && want.micOn ? 'denied' : answer.microphone,
              });
            });
          }
        }

        const fallback = acquired.current;
        const fallbackJustFailed = fallback.micOn === want.micOn && fallback.cameraOn === want.cameraOn;
        setWant(fallbackJustFailed ? { micOn: false, cameraOn: false } : fallback);
      });

    return () => {
      active = false;
    };
    // Keyed on the wanted set, not on `session`, whose identity changes on every media event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey]);

  const micOn = want.micOn && !missing.mic;
  const cameraOn = want.cameraOn && !missing.camera;

  // The preview element is fed from the session's stream rather than owning a `getUserMedia` of its
  // own, so there is one camera open between this card and the room it leads to.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = session.previewStream ?? null;
  }, [session.previewStream, cameraOn]);

  const cameraBlocked = permission !== null && isMediaBlocked(permission.camera);
  const micBlocked = permission !== null && isMediaBlocked(permission.microphone);
  const blocked = cameraBlocked && micBlocked;

  const toggle = (next: Partial<DebateJoinState>) => {
    if (next.micOn !== undefined && micBlocked) return;
    if (next.cameraOn !== undefined && cameraBlocked) return;
    setFailure(null);
    setWant(current => ({ ...current, ...next }));
  };

  const { summary, announcement } = describeJoinState({ micOn, cameraOn });

  const toggles = blocked ? null : (
    <div className="flex items-center justify-center gap-2">
      {!micBlocked && (
        <DebateTileToggleButton
          ariaLabel={micOn ? 'Turn microphone off' : 'Turn microphone on'}
          enabled={micOn}
          onClick={() => toggle({ micOn: !micOn })}
        >
          <MicrophoneIcon muted={!micOn} />
        </DebateTileToggleButton>
      )}
      {!cameraBlocked && (
        <DebateTileToggleButton
          ariaLabel={cameraOn ? 'Turn camera off' : 'Turn camera on'}
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
        <DebateVideoTile
          participantPosition={null}
          active={false}
          tileLabel="You"
          inactiveIndicatorId="local"
          tileControls={toggles}
        >
          <video ref={videoRef} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
        </DebateVideoTile>
      ) : (
        <>
          <div className="grid place-items-center py-1">
            <span className="h-5 w-5 overflow-hidden rounded-full">
              <Avatar avatarUrl={avatarCid ?? undefined} value={avatarValue ?? undefined} alt="" size={20} />
            </span>
          </div>
          {toggles}
        </>
      )}

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
      ) : missing.mic && missing.camera ? (
        <Text variant="footnote" color="grey-04">
          No camera or microphone found.
        </Text>
      ) : missing.camera ? (
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
