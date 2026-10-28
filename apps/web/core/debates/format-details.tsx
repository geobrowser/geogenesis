'use client';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateRequest } from './api';
import {
  type DebateTurnRole,
  type OpenRoundsFormat,
  debateFormatById,
  debateTurnRole,
  defaultDebateFormatId,
  formatTurnDuration,
  hasNumberedOpenRoundsTurns,
  isOpenRoundsFormatId,
  openRoundsDefaultRebuttalTurnMs,
  openRoundsExtraTurnMs,
  openRoundsInitialTurnDurationsMs,
} from './formats';
import { openRoundIndexForTurn, openRoundNumber, openRoundsRequiredRebuttalRounds } from './open-rounds';
import { speakerLabel } from './playback-utils';

type FormatParticipant = {
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
};

/**
 * The format box's Open rounds block for a pending request. The server decides the format, cap and
 * required rounds and initial turns when the request is made. Missing turns identify a legacy
 * request; its required-round count alone cannot identify the timing generation.
 */
export function requestOpenRounds(
  request: Pick<DebateRequest, 'max_rebuttal_rounds' | 'required_rebuttal_rounds' | 'turn_durations_ms'>
): OpenRoundsFormat | null {
  if (request.max_rebuttal_rounds == null) return null;
  return {
    max_rebuttal_rounds: request.max_rebuttal_rounds,
    required_rebuttal_rounds: request.required_rebuttal_rounds ?? 0,
    ...(request.turn_durations_ms && { turn_durations_ms: request.turn_durations_ms }),
    rebuttal_turn_ms: hasNumberedOpenRoundsTurns(request.turn_durations_ms ?? [])
      ? openRoundsExtraTurnMs
      : openRoundsDefaultRebuttalTurnMs,
  };
}

export function DebateFormatDetails({
  formatId,
  openRounds,
  participants,
  currentUserId,
}: {
  formatId: string | null | undefined;
  /**
   * The debate's own `open_rounds` block, when there is a debate. It carries the cap the server
   * snapshotted for this debate. For a pending request, build it with `requestOpenRounds`.
   */
  openRounds?: OpenRoundsFormat | null;
  participants: FormatParticipant[];
  currentUserId: string;
}) {
  const firstParticipant = participants[0];
  if (!firstParticipant) return null;

  // GEO-3173. Open rounds has two opening turns and its required rebuttal rounds, then only the
  // rebuttal rounds both debaters pick, so listing those up front would promise turns that may
  // never happen.
  const isOpenRounds = Boolean(openRounds) || isOpenRoundsFormatId(formatId);
  // No id means the server default. An id this build does not know is not the default, though,
  // and showing the default's turns for it would describe a different debate.
  const fixedFormat = isOpenRounds ? null : debateFormatById(formatId || defaultDebateFormatId);
  const rebuttalTurnMs = openRounds?.rebuttal_turn_ms ?? openRoundsDefaultRebuttalTurnMs;
  const requiredRebuttalRounds = openRounds ? openRoundsRequiredRebuttalRounds(openRounds) : 0;
  const initialTurns = openRoundsInitialTurnDurationsMs(
    openRounds ?? { max_rebuttal_rounds: 0, rebuttal_turn_ms: rebuttalTurnMs }
  );
  const numberedOnly = isOpenRounds && hasNumberedOpenRoundsTurns(initialTurns);
  const maxRebuttalRounds = openRounds?.max_rebuttal_rounds ?? null;
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
    : initialTurns.map((durationMs, index) => ({
        durationMs,
        role: index < 2 ? ('opening' as const) : ('rebuttal' as const),
      }));

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
            label={
              numberedOnly
                ? `Round ${openRoundNumber(openRoundIndexForTurn(index))} · ${participant.user_id === currentUserId ? 'You' : speakerLabel(participant)}`
                : turnLabel(participant, currentUserId, role)
            }
          />
        );
      })}
      {/* A cap no higher than the required rounds leaves no round to extend into. */}
      {isOpenRounds && (maxRebuttalRounds === null || maxRebuttalRounds > requiredRebuttalRounds) && (
        <OpenRoundsRebuttalRow
          rebuttalTurnMs={rebuttalTurnMs}
          extendableRounds={maxRebuttalRounds === null ? null : maxRebuttalRounds - requiredRebuttalRounds}
          afterRequiredRounds={requiredRebuttalRounds > 0}
          numberedOnly={numberedOnly}
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

/** The dashed row: rebuttal rounds that happen when one debater picks Extend and neither picks End. */
function OpenRoundsRebuttalRow({
  rebuttalTurnMs,
  extendableRounds,
  afterRequiredRounds,
  numberedOnly,
}: {
  rebuttalTurnMs: number;
  /** The cap less the required rounds, which the turn rows above already list. */
  extendableRounds: number | null;
  afterRequiredRounds: boolean;
  numberedOnly: boolean;
}) {
  // The cap is decided with the request (GEO-3201), so a format box without one would be naming a
  // guess at what the server will enforce.
  const more = afterRequiredRounds ? ' more' : '';
  const cap =
    extendableRounds !== null && extendableRounds > 0
      ? ` Up to ${extendableRounds}${more} ${extendableRounds === 1 ? 'round' : 'rounds'}.`
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
          {numberedOnly
            ? 'Both of you must pick Extend to add a round.'
            : 'A round happens if one of you picks Extend and neither picks End.'}
          {cap}
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
