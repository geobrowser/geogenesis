import { describe, expect, it } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import { AGENDA_SAVE_FAILED, agendaConflictBase, agendaErrorMessage } from './call-errors';

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

describe('agendaConflictBase', () => {
  it('reads the stamp of the agenda that won, or null once cleared', () => {
    const agenda = { body: 'Theirs', updated_at: '2026-11-01T10:00:00Z', updated_by: null };
    expect(agendaConflictBase(error('agenda_conflict', { agenda }))).toBe('2026-11-01T10:00:00Z');
    expect(agendaConflictBase(error('agenda_conflict', { agenda: null }))).toBeNull();
    expect(agendaConflictBase(error('agenda_too_long', { limit: 10 }))).toBeUndefined();
    expect(agendaConflictBase(new Error('x'))).toBeUndefined();
  });
});
