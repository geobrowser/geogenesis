'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getLiveParticipants } from '~/core/community-calls/api';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';

import { Avatar } from '~/design-system/avatar';

const MAX_VISIBLE = 4;
/** Mini avatars in the 2x2 "+N more" cell. */
const OVERFLOW_VISIBLE = 4;
const POLL_MS = 15_000;

/**
 * Live-card participant strip. Mirrors curator's LiveMeetingCardWithParticipants:
 * polls the public curator-backend participants endpoint (no LiveKit room join
 * needed), shows editors/members only, and collapses overflow into a 2x2
 * mini-avatar "+N more" cell.
 *
 * Avatars come from the Geo profile rather than the `avatarCid` on the participant
 * record. That cid is minted into the LiveKit token from curator-backend's own
 * profile store, which is a different source from the one the rest of the page reads
 * — so someone whose avatar lives in the knowledge graph arrived here with no cid and
 * fell back to a generated avatar while the leaderboard beside them showed their real
 * photo (GEO-2677). The cid stays as a fallback for anyone the graph has no profile for.
 */
export function ParticipantAvatarStrip({
  spaceId,
  callId,
  occurrenceStart,
}: {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
}) {
  const { data } = useQuery({
    queryKey: ['community-call-live-participants', spaceId, callId, occurrenceStart],
    queryFn: () => getLiveParticipants({ spaceId, callId, occurrenceStart }),
    refetchInterval: POLL_MS,
  });

  const participants = React.useMemo(
    () => (data?.participants ?? []).filter(p => p.isEditor || p.isMember),
    [data?.participants]
  );

  // A participant's `identity` is their personal space id — curator-backend mints the
  // token with `getStableProfileIdentity`, which returns `profile.spaceId`. That makes
  // it the same key the curator leaderboard resolves profiles with.
  //
  // Only the avatars that actually render are looked up. A busy call can hold far more
  // members than the eight cells below, and `fetchProfilesBySpaceIds` sends one
  // unchunked request whose failure path returns defaults for the whole list — so asking
  // for all of them risks losing every avatar to a call that is merely popular.
  const renderedIdentities = React.useMemo(
    () => participants.slice(0, MAX_VISIBLE + OVERFLOW_VISIBLE).map(p => p.identity),
    [participants]
  );

  // Per-id cache entries rather than one query keyed on the whole set: the participant
  // list changes whenever someone joins or leaves, and a set-keyed query would drop every
  // resolved avatar back to a placeholder until the new batch landed — the exact flash
  // this component exists to avoid. Requests still leave as one coalesced batch.
  const { profilesBySpaceId } = useProfilesBySpaceIds(renderedIdentities);

  if (participants.length === 0) return null;

  const avatarFor = (identity: string, avatarCid: string | null) =>
    profilesBySpaceId.get(identity)?.avatarUrl ?? (avatarCid ? `ipfs://${avatarCid}` : undefined);

  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.slice(MAX_VISIBLE, MAX_VISIBLE + OVERFLOW_VISIBLE);
  const remaining = participants.length - visible.length;

  return (
    <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-grey-02 pt-3">
      {visible.map(p => (
        <ParticipantAvatar
          key={p.identity}
          identity={p.identity}
          name={p.name || p.identity}
          avatarUrl={avatarFor(p.identity, p.avatarCid)}
        />
      ))}
      {remaining > 0 && (
        <div className="flex w-[55px] flex-col items-center gap-1.5">
          <div className="grid size-11 grid-cols-2 gap-1">
            {overflow.map(p => (
              <span key={p.identity} className="size-5 overflow-hidden rounded-full border border-white">
                <Avatar value={p.identity} avatarUrl={avatarFor(p.identity, p.avatarCid)} size={20} />
              </span>
            ))}
          </div>
          <span className="w-full truncate text-center text-[12px] leading-[16px] text-grey-04">+{remaining} more</span>
        </div>
      )}
    </div>
  );
}

function ParticipantAvatar({
  identity,
  name,
  avatarUrl,
}: {
  identity: string;
  name: string;
  avatarUrl: string | undefined;
}) {
  return (
    <div className="flex w-[55px] flex-col items-center gap-1.5">
      <span className="size-11 shrink-0 overflow-hidden rounded-full">
        {/* Keyed on the space id, like the leaderboard, so someone with no avatar at all
            gets the same generated one here as everywhere else on the page. */}
        <Avatar value={identity} avatarUrl={avatarUrl} size={44} />
      </span>
      <span className="w-full truncate text-center text-[12px] leading-[16px] text-grey-04">{name}</span>
    </div>
  );
}
