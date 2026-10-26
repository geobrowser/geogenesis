import { type DebateCallAgenda, GeoChatRequestError } from '~/core/debates/api';
import { lobbyErrorMessage } from '~/core/debates/lobbies/lobby-format';

export const AGENDA_SAVE_FAILED = 'Could not save the agenda. Try again.';

/** An agenda write's failure, in words (GEO-3420). */
export function agendaErrorMessage(error: unknown): string {
  if (error instanceof GeoChatRequestError) {
    switch (error.code) {
      case 'agenda_conflict':
        return 'Someone else just changed the agenda. Cancel to see theirs, or save again to replace it.';
      case 'agenda_too_long': {
        const limit = error.details?.limit;
        return typeof limit === 'number'
          ? `Keep the agenda to ${limit.toLocaleString('en-US')} characters.`
          : 'The agenda is too long.';
      }
      case 'agenda_invalid':
        return 'Remove the special formatting characters from the agenda.';
      case 'call_host_required':
        return 'Only hosts and editors of this space can edit the agenda.';
      case 'call_cancelled':
        return 'This call was cancelled.';
    }
  }
  return lobbyErrorMessage(error, AGENDA_SAVE_FAILED, 'call');
}

/** On `agenda_conflict`, the agenda geo-chat holds now (`null` if cleared); `undefined` otherwise. */
export function agendaConflictCurrent(error: unknown): DebateCallAgenda | null | undefined {
  if (!(error instanceof GeoChatRequestError) || error.code !== 'agenda_conflict') return undefined;
  const agenda = error.details?.agenda;
  return agenda && typeof agenda === 'object' ? (agenda as DebateCallAgenda) : null;
}

/** On `agenda_conflict`, the base a deliberate overwrite sends; `undefined` otherwise. */
export function agendaConflictBase(error: unknown): string | null | undefined {
  const current = agendaConflictCurrent(error);
  return current === undefined ? undefined : (current?.updated_at ?? null);
}
