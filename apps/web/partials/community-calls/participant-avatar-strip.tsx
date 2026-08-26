'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getLiveParticipants } from '~/core/community-calls/api';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';

import { Avatar } from '~/design-system/avatar';

const MAX_VISIBLE = 4;
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
  const identities = React.useMemo(() => participants.map(p => p.identity), [participants]);

  const { data: avatarByIdentity } = useQuery({
    // Sorted so a reordered participant list (the poll returns join order) doesn't
    // refetch the same set of profiles.
    queryKey: ['community-call-participant-profiles', [...identities].sort()],
    enabled: identities.length > 0,
    queryFn: async () => {
      // fetchProfilesBySpaceIds returns one profile per input id, in order, so the two
      // arrays zip by index — no id-shape normalization needed on either side.
      const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(identities));
      return new Map(identities.map((identity, index) => [identity, profiles[index]?.avatarUrl ?? null]));
    },
  });

  if (participants.length === 0) return null;

  const avatarFor = (identity: string, avatarCid: string | null) =>
    avatarByIdentity?.get(identity) ?? (avatarCid ? `ipfs://${avatarCid}` : undefined);

  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.slice(MAX_VISIBLE, MAX_VISIBLE + 4);
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
