import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';
import { agendaConflictBase, agendaErrorMessage } from '~/core/space-calls/series/call-errors';

import { CallAgenda } from './call-agenda';

afterEach(cleanup);

describe('CallAgenda', () => {
  it('renders markdown for a reader, with no edit control', () => {
    render(
      <CallAgenda
        markdown={'**Intros**\n\nUpdates'}
        updatedAt="v1"
        canEdit={false}
        onSave={vi.fn()}
        errorMessage={() => 'x'}
        conflictBase={agendaConflictBase}
      />
    );
    expect(screen.getByText('Intros')).toBeInTheDocument();
    expect(screen.queryByText('**Intros**')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets a host edit and save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CallAgenda
        markdown=""
        updatedAt={null}
        canEdit
        onSave={onSave}
        errorMessage={() => 'x'}
        conflictBase={agendaConflictBase}
      />
    );
    expect(screen.getByText('No agenda yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add agenda' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: ' Intros ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledWith('Intros', null);
  });

  it('keeps the draft open when saving fails', async () => {
    render(
      <CallAgenda
        markdown="Old"
        updatedAt="v1"
        canEdit
        onSave={() => Promise.reject(new Error('no'))}
        errorMessage={() => 'Could not save the agenda. Try again.'}
        conflictBase={agendaConflictBase}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save the agenda. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Agenda' })).toHaveValue('Old');
  });

  it('saves against the agenda the edit started from, then overwrites only on a second save', async () => {
    const conflict = new GeoChatRequestError('conflict', 'agenda_conflict', 409, null, {
      agenda: { body: 'Theirs', updated_at: 'v2', updated_by: null },
    });
    const onSave = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(undefined);
    const props = { canEdit: true, onSave, errorMessage: agendaErrorMessage, conflictBase: agendaConflictBase };
    const { rerender } = render(<CallAgenda markdown="Mine" updatedAt="v1" {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit agenda' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Mine, edited' } });

    // Another host saved; a realtime refetch hands this page their stamp mid-edit.
    rerender(<CallAgenda markdown="Theirs" updatedAt="v2" {...props} />);
    expect(screen.getByRole('textbox', { name: 'Agenda' })).toHaveValue('Mine, edited');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Someone else just changed the agenda/)).toBeInTheDocument();
    expect(onSave).toHaveBeenNthCalledWith(1, 'Mine, edited', 'v1');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenNthCalledWith(2, 'Mine, edited', 'v2');
  });
});
