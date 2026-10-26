import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CallAgenda } from './call-agenda';

afterEach(cleanup);

describe('CallAgenda', () => {
  it('renders markdown for a reader, with no edit control', () => {
    render(<CallAgenda markdown={'**Intros**\n\nUpdates'} canEdit={false} onSave={vi.fn()} errorMessage={() => 'x'} />);
    expect(screen.getByText('Intros')).toBeInTheDocument();
    expect(screen.queryByText('**Intros**')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets a host edit and save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CallAgenda markdown="" canEdit onSave={onSave} errorMessage={() => 'x'} />);
    expect(screen.getByText('No agenda yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add agenda' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: ' Intros ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledWith('Intros');
  });

  it('keeps the draft open when saving fails', async () => {
    render(
      <CallAgenda
        markdown="Old"
        canEdit
        onSave={() => Promise.reject(new Error('no'))}
        errorMessage={() => 'Could not save the agenda. Try again.'}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save the agenda. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Agenda' })).toHaveValue('Old');
  });
});
