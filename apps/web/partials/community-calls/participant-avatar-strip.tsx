'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getLiveParticipants } from '~/core/community-calls/api';

import { Avatar } from '~/design-system/avatar';

const MAX_VISIBLE = 4;
const POLL_MS = 15_000;

/**
 * Live-card participant strip. Mirrors curator's LiveMeetingCardWithParticipants:
 * polls the public curator-backend participants endpoint (no LiveKit room join
 * needed), shows editors/members only, and collapses overflow into a 2x2
 * mini-avatar "+N more" cell.
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

  const participants = (data?.participants ?? []).filter(p => p.isEditor || p.isMember);
  if (participants.length === 0) return null;

  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.slice(MAX_VISIBLE, MAX_VISIBLE + 4);
  const remaining = participants.length - visible.length;

  return (
    <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-grey-02 pt-3">
      {visible.map(p => (
        <ParticipantAvatar key={p.identity} name={p.name || p.identity} avatarCid={p.avatarCid} />
      ))}
      {remaining > 0 && (
        <div className="flex w-[55px] flex-col items-center gap-1.5">
          <div className="grid size-11 grid-cols-2 gap-1">
            {overflow.map(p => (
              <span key={p.identity} className="size-5 overflow-hidden rounded-full border border-white">
                <Avatar
                  value={p.name || p.identity}
                  avatarUrl={p.avatarCid ? `ipfs://${p.avatarCid}` : undefined}
                  size={20}
                />
              </span>
            ))}
          </div>
          <span className="w-full truncate text-center text-[12px] leading-[16px] text-grey-04">+{remaining} more</span>
        </div>
      )}
    </div>
  );
}

function ParticipantAvatar({ name, avatarCid }: { name: string; avatarCid: string | null }) {
  return (
    <div className="flex w-[55px] flex-col items-center gap-1.5">
      <span className="size-11 shrink-0 overflow-hidden rounded-full">
        <Avatar value={name} avatarUrl={avatarCid ? `ipfs://${avatarCid}` : undefined} size={44} />
      </span>
      <span className="w-full truncate text-center text-[12px] leading-[16px] text-grey-04">{name}</span>
    </div>
  );
}
