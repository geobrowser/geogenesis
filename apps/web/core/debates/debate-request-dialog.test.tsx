import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRequestDialogParticipant } from './debate-request-dialog';
import { DebateRequestDialog } from './debate-request-dialog';

const participants: DebateRequestDialogParticipant[] = [
  {
    user_id: 'user-local',
    profile_space_id: 'profile-local',
    display_name: 'Local speaker',
    avatar_cid: null,
    participant_slot: 1,
    position: true,
    position_label: 'Yes',
  },
  {
    user_id: 'user-remote',
    profile_space_id: 'profile-remote',
    display_name: 'Remote speaker',
    avatar_cid: null,
    participant_slot: 2,
    position: false,
    position_label: 'No',
  },
];

beforeEach(() => {
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(cleanup);

describe('DebateRequestDialog', () => {
  it('renders the canonical request layout and optional format selector', () => {
    const accept = vi.fn();
    const reject = vi.fn();
    const changeFormat = vi.fn();

    render(
      <DebateRequestDialog
        claim="The protocol should ship debates"
        participants={[...participants].reverse()}
        currentUserId="user-local"
        formatId="standard"
        formatSelector={{
          value: 'standard',
          selectedFormatId: 'standard',
          name: 'request-format',
          onChange: changeFormat,
        }}
        busy={false}
        error={null}
        onAccept={accept}
        onReject={reject}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'The protocol should ship debates' });
    expect(within(dialog).getByText('Debate request')).toBeInTheDocument();
    expect(within(dialog).getByText('You')).toBeInTheDocument();
    expect(within(dialog).getByText('Remote speaker')).toBeInTheDocument();
    expect(within(dialog).getByText('VS')).toBeInTheDocument();
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Yes')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Remote speaker').parentElement!).getByText('No')).toBeInTheDocument();
    expect(within(dialog).getAllByText('1m')).toHaveLength(2);
    expect(within(dialog).getAllByText('45s')).toHaveLength(2);

    fireEvent.change(within(dialog).getByLabelText('Debate format'), {
      target: { value: 'extended-standard' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(changeFormat).toHaveBeenCalledWith('extended-standard');
    expect(accept).toHaveBeenCalledOnce();
    expect(reject).toHaveBeenCalledOnce();
  });

  it('keeps the positive participant on the left and the negative participant on the right', () => {
    render(
      <DebateRequestDialog
        claim="Position order should be stable"
        participants={[
          {
            ...participants[0]!,
            avatar_cid: 'https://example.com/local-avatar.png',
            position: false,
            position_label: 'Against',
          },
          {
            ...participants[1]!,
            avatar_cid: 'https://example.com/remote-avatar.png',
            position: true,
            position_label: 'For',
          },
        ]}
        currentUserId="user-local"
        formatId="standard"
        busy={false}
        error={null}
        onAccept={() => undefined}
        onReject={() => undefined}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Position order should be stable' });
    const localParticipant = within(dialog).getByText('You').parentElement!;
    const remoteParticipant = within(dialog).getByText('Remote speaker').parentElement!;

    expect(remoteParticipant.compareDocumentPosition(localParticipant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(remoteParticipant).getByText('For')).toBeInTheDocument();
    expect(within(remoteParticipant).getByAltText('Remote speaker')).toBeInTheDocument();
    expect(within(localParticipant).getByText('Against')).toBeInTheDocument();
    expect(within(localParticipant).getByAltText('Local speaker')).toBeInTheDocument();

    const localFirstTurn = within(dialog).getByText('You make an argument');
    const remoteFirstTurn = within(dialog).getByText('Remote speaker makes an argument');
    expect(localFirstTurn.compareDocumentPosition(remoteFirstTurn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('locks scrolling and surfaces busy and error states', () => {
    const { unmount } = render(
      <DebateRequestDialog
        claim="A claim with an error"
        participants={participants}
        currentUserId="user-local"
        formatId="standard"
        formatSelector={{
          value: 'standard',
          name: 'busy-request-format',
          onChange: () => undefined,
        }}
        busy
        error="Could not accept the request."
        onAccept={() => undefined}
        onReject={() => undefined}
      />
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(screen.getByText('Could not accept the request.')).toBeInTheDocument();
    expect(screen.getByLabelText('Debate format')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });
});
