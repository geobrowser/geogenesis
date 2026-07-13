'use client';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { debateFormatById, defaultDebateFormatId } from './formats';

type FormatParticipant = {
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
};

export function DebateFormatDetails({
  formatId,
  participants,
  currentUserId,
}: {
  formatId: string | null | undefined;
  participants: FormatParticipant[];
  currentUserId: string;
}) {
  const format = debateFormatById(formatId) ?? debateFormatById(defaultDebateFormatId)!;
  const firstParticipant = participants[0];
  if (!firstParticipant) return null;

  return (
    <div className="grid gap-1.5">
      {format.turnDurationsMs.map((durationMs, index) => {
        const participant = participants[index % participants.length] ?? firstParticipant;
        const alternate = index % 2 === 1;
        return (
          <div key={`${format.id}-${index}`} className={alternate ? 'rounded-lg bg-bg px-2 py-2' : 'px-2 py-2'}>
            <div className="grid grid-cols-[3rem_1.75rem_minmax(0,1fr)] items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-text text-button text-text">
                {formatTurnDuration(durationMs)}
              </span>
              <span className="h-6 w-6 overflow-hidden rounded-full">
                <Avatar
                  avatarUrl={participant.avatar_cid}
                  value={participant.profile_space_id}
                  alt={speakerLabel(participant)}
                  size={24}
                />
              </span>
              <Text as="div" variant="bodySemibold" color="text" className="min-w-0 truncate">
                {turnLabel(participant, currentUserId, index, format.turnDurationsMs.length)}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function turnLabel(participant: FormatParticipant, currentUserId: string, turnIndex: number, turnCount: number) {
  const name = participant.user_id === currentUserId ? 'You' : speakerLabel(participant);
  const roundIndex = Math.floor(turnIndex / 2);
  if (roundIndex === 0) return `${name} ${name === 'You' ? 'make' : 'makes'} an argument`;
  if (roundIndex === Math.floor((turnCount - 1) / 2)) return `${name} ${name === 'You' ? 'rebut' : 'rebuts'}`;
  return `${name} ${name === 'You' ? 'respond' : 'responds'}`;
}

function formatTurnDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  return seconds > 0 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

function speakerLabel(participant: FormatParticipant) {
  return participant.display_name || participant.profile_space_id;
}
