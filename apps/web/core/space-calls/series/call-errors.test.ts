import { describe, expect, it } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import { AGENDA_SAVE_FAILED, agendaErrorMessage } from './call-errors';

const error = (code: string, details: Record<string, unknown> | null = null) =>
  new GeoChatRequestError(code, code, code === 'agenda_conflict' ? 409 : 400, null, details);

describe('agendaErrorMessage', () => {
  it('names the agenda failures', () => {
    expect(agendaErrorMessage(error('agenda_conflict'))).toMatch(/Someone else just changed the agenda/);
    expect(agendaErrorMessage(error('agenda_too_long', { limit: 10000 }))).toBe(
      'Keep the agenda to 10,000 characters.'
    );
  });

  it('falls back for anything else', () => {
    expect(agendaErrorMessage(new Error('x'))).toBe(AGENDA_SAVE_FAILED);
  });
});
