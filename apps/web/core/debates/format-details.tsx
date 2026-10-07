'use client';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateOpenRounds } from './api';
import {
  type DebateTurnRole,
  debateFormatById,
  debateTurnRole,
  defaultDebateFormatId,
  formatTurnDuration,
  isOpenRoundsFormatId,
  openRoundsDefaultRebuttalTurnMs,
  openRoundsOpeningTurnDurationsMs,
} from './formats';
import { speakerLabel } from './playback-utils';

type FormatParticipant = {
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
};

/** What the format box needs from a debate's `open_rounds` block. */
export type DebateFormatOpenRounds = Pick<DebateOpenRounds, 'max_rebuttal_rounds' | 'rebuttal_turn_ms'>;

export function DebateFormatDetails({
  formatId,
  openRounds,
  participants,
  currentUserId,
}: {
  formatId: string | null | undefined;
  /**
   * The debate's own `open_rounds` block, when there is a debate. It carries the cap the server
   * snapshotted for this debate. A request has no debate yet, so it has no block and no cap.
   */
  openRounds?: DebateFormatOpenRounds | null;
  participants: FormatParticipant[];
  currentUserId: string;
}) {
  const firstParticipant = participants[0];
  if (!firstParticipant) return null;

  // GEO-3173. Open rounds has two opening turns and then only the rebuttal rounds both debaters
  // pick, so listing turns up front would promise a closing turn that never happens.
  const isOpenRounds = Boolean(openRounds) || isOpenRoundsFormatId(formatId);
  // No id means the server default. An id this build does not know is not the default, though,
  // and showing the default's turns for it would describe a different debate.
  const fixedFormat = isOpenRounds ? null : debateFormatById(formatId || defaultDebateFormatId);
  if (!isOpenRounds && !fixedFormat) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="px-3 py-3">
        This version of Geo can’t show this debate’s format. Refresh to see its turns.
      </Text>
    );
  }

  const turns: { durationMs: number; role: DebateTurnRole }[] = fixedFormat
    ? fixedFormat.turnDurationsMs.map((durationMs, index, all) => ({
        durationMs,
        role: debateTurnRole(index, all.length),
      }))
    : openRoundsOpeningTurnDurationsMs.map(durationMs => ({ durationMs, role: 'opening' }));

  return (
    <div className="grid">
      {turns.map(({ durationMs, role }, index) => {
        const participant = participants[index % participants.length] ?? firstParticipant;
        return (
          <TurnRow
            key={index}
            durationMs={durationMs}
            alternate={index % 2 === 1}
            participant={participant}
            label={turnLabel(participant, currentUserId, role)}
          />
        );
      })}
      {isOpenRounds && (
        <OpenRoundsRebuttalRow
          rebuttalTurnMs={openRounds?.rebuttal_turn_ms ?? openRoundsDefaultRebuttalTurnMs}
          maxRebuttalRounds={openRounds?.max_rebuttal_rounds ?? null}
        />
      )}
    </div>
  );
}

function TurnRow({
  durationMs,
  alternate,
  participant,
  label,
}: {
  durationMs: number;
  alternate: boolean;
  participant: FormatParticipant;
  label: string;
}) {
  return (
    <div className={`flex items-center gap-5 rounded-md px-3 py-3 ${alternate ? 'bg-grey-01' : ''}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-text text-smallButton text-text">
        {formatTurnDuration(durationMs)}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="h-4 w-4 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={participant.avatar_cid}
            value={participant.profile_space_id}
            alt={speakerLabel(participant)}
            size={16}
          />
        </span>
        <Text as="div" variant="metadataMedium" color="text" className="min-w-0 truncate">
          {label}
        </Text>
      </div>
    </div>
  );
}

/** The dashed row: rebuttal rounds that happen only if both debaters pick Extend. */
function OpenRoundsRebuttalRow({
  rebuttalTurnMs,
  maxRebuttalRounds,
}: {
  rebuttalTurnMs: number;
  maxRebuttalRounds: number | null;
}) {
  // The cap is snapshotted onto a debate when it is created, so only a debate knows it. Without
  // one, naming a number would be a guess at what the server will enforce.
  const cap =
    maxRebuttalRounds !== null && maxRebuttalRounds > 0
      ? ` Up to ${maxRebuttalRounds} ${maxRebuttalRounds === 1 ? 'round' : 'rounds'}.`
      : '';

  return (
    <div className="mt-1 flex items-start gap-5 rounded-md border border-dashed border-grey-03 px-3 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-grey-04 text-smallButton text-grey-04">
        {formatTurnDuration(rebuttalTurnMs)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="div" variant="metadataMedium" color="text">
          Then extend, round by round
        </Text>
        <Text as="div" variant="metadata" color="grey-04">
          A round happens only if you both pick Extend.{cap}
        </Text>
      </div>
    </div>
  );
}

function turnLabel(participant: FormatParticipant, currentUserId: string, role: DebateTurnRole) {
  const name = participant.user_id === currentUserId ? 'You' : speakerLabel(participant);
  const you = name === 'You';
  switch (role) {
    case 'opening':
      return `${name} ${you ? 'make' : 'makes'} an argument`;
    case 'rebuttal':
      return `${name} ${you ? 'rebut' : 'rebuts'}`;
    case 'closing':
      return `${name} ${you ? 'close' : 'closes'} to the audience`;
    default:
      return `${name} ${you ? 'respond' : 'responds'}`;
  }
}
