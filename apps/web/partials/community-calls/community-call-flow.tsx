'use client';

import { usePrivy } from '@geogenesis/auth';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getCommunityCallToken, getViewerToken } from '~/core/community-calls/api';
import { CALL_SCHEMA, buildRoomName, isOccurrenceLive } from '~/core/community-calls/constants';
import { getOccurrences } from '~/core/community-calls/occurrences';
import { CommunityCallToken, ViewerToken } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { getEntity, getSpace } from '~/core/io/queries';

import { LiveRoom } from './live-room';
import { PreJoin, PreJoinSettings } from './pre-join';

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center text-grey-04">{children}</div>
  );
}

type Joined =
  | { kind: 'participant'; token: CommunityCallToken; settings: PreJoinSettings }
  | { kind: 'viewer'; token: ViewerToken };

export function CommunityCallFlow({ spaceId, callId }: { spaceId: string; callId: string }) {
  const { getToken } = useCommunityCallIdentityToken();
  const { ready: privyReady, authenticated } = usePrivy();
  const { isEditor, isMember, isLoading: accessLoading } = useAccessControl(spaceId);
  const canParticipate = isEditor || isMember;
  const accessResolved = privyReady && (!authenticated || !accessLoading);
  const looksLikeNonMember = accessResolved && !canParticipate;

  // The wallet/access-control hooks this depends on (Privy -> wagmi -> smart account ->
  // personal-space-id) are each backed by a query that can report isLoading:false for a
  // render or two right as it becomes enabled but before it's dispatched its fetch — so
  // `looksLikeNonMember` can flicker true before settling. Debounce it so a momentary
  // glitch can't lock an actual editor into the (irreversible) viewer auto-join below.
  const [confirmedNonMember, setConfirmedNonMember] = React.useState(false);
  React.useEffect(() => {
    setConfirmedNonMember(false);
    if (!looksLikeNonMember) return;
    const timer = setTimeout(() => setConfirmedNonMember(true), 800);
    return () => clearTimeout(timer);
  }, [looksLikeNonMember]);

  const { data, isLoading } = useQuery({
    queryKey: ['community-call', spaceId, callId],
    queryFn: async () => {
      const [entity, space] = await Promise.all([
        Effect.runPromise(getEntity(callId, spaceId)),
        Effect.runPromise(getSpace(spaceId)),
      ]);
      const schedule = entity?.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value ?? '';
      return { schedule, spaceName: space?.entity?.name ?? 'this space' };
    },
  });

  const [joined, setJoined] = React.useState<Joined | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const liveOccurrence = React.useMemo(() => {
    if (!data?.schedule) return null;
    const now = Date.now();
    return getOccurrences(data.schedule, now).find(o => isOccurrenceLive(o.startMs, o.endMs, now)) ?? null;
  }, [data?.schedule]);

  const backHref = `/space/${spaceId}/community`;
  const spaceName = data?.spaceName ?? 'this space';

  const onJoin = async (settings: PreJoinSettings) => {
    setJoining(true);
    setError(null);
    try {
      const identity = await getToken();
      if (!identity) {
        setError('Sign in to join this community call.');
        return;
      }
      const token = await getCommunityCallToken({ spaceId, callId }, identity);
      setJoined({ kind: 'participant', token, settings });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the call.');
    } finally {
      setJoining(false);
    }
  };

  // Non-members (including signed-out visitors) skip the device-preview step
  // entirely and auto-connect watch-only.
  React.useEffect(() => {
    if (error || joined || joining || !confirmedNonMember || canParticipate || !liveOccurrence) return;
    setJoining(true);
    getViewerToken({ spaceId, callId })
      .then(token => setJoined({ kind: 'viewer', token }))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not join the call.'))
      .finally(() => setJoining(false));
  }, [error, joined, joining, confirmedNonMember, canParticipate, liveOccurrence, spaceId, callId]);

  if (joined?.kind === 'participant') {
    return (
      <LiveRoom
        token={joined.token.token}
        url={joined.token.url}
        roomName={buildRoomName(spaceId, callId, joined.token.occurrenceStart)}
        spaceName={spaceName}
        isEditor={isEditor}
        isViewer={false}
        spaceId={spaceId}
        callId={callId}
        occurrenceStart={joined.token.occurrenceStart}
        occurrenceEnd={liveOccurrence?.endMs}
        audio={joined.settings.audioEnabled}
        video={joined.settings.videoEnabled}
        backHref={backHref}
      />
    );
  }

  if (joined?.kind === 'viewer') {
    return (
      <LiveRoom
        token={joined.token.token}
        url={joined.token.url}
        roomName={buildRoomName(spaceId, callId, joined.token.occurrenceStart)}
        spaceName={spaceName}
        isEditor={false}
        isViewer
        spaceId={spaceId}
        callId={callId}
        occurrenceStart={joined.token.occurrenceStart}
        occurrenceEnd={liveOccurrence?.endMs}
        audio={false}
        video={false}
        backHref={backHref}
      />
    );
  }

  const resolvingAccess = !accessResolved || (looksLikeNonMember && !confirmedNonMember);
  if (isLoading || resolvingAccess) return <Notice>Loading call…</Notice>;

  if (!liveOccurrence) {
    return (
      <Notice>
        <p className="text-smallTitle text-text">This call isn’t active right now.</p>
        <p>You can join from 15 minutes before it starts until 30 minutes after it ends.</p>
      </Notice>
    );
  }

  if (!canParticipate) {
    return <Notice>{error ? <p className="text-red-01">{error}</p> : <p>Joining as a viewer…</p>}</Notice>;
  }

  return (
    <>
      {error && <p className="px-4 pt-4 text-center text-metadata text-red-01">{error}</p>}
      <PreJoin spaceName={spaceName} occurrence={liveOccurrence} joining={joining} onJoin={onJoin} />
    </>
  );
}
