import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRequestDialogParticipant } from './debate-request-dialog';
import { DebateRequestDialog } from './debate-request-dialog';

const media = vi.hoisted(() => ({
  releaseSession: vi.fn(),
  beginSession: vi.fn(),
  stopMedia: vi.fn(),
  ensurePreview: vi.fn(),
}));

vi.mock('./media-session', () => ({
  useOptionalDebateMediaSession: () => ({
    previewState: 'idle',
    previewError: null,
    previewStream: null,
    localTracksRef: { current: [] },
    ensurePreview: media.ensurePreview,
    beginSession: media.beginSession,
    releaseSession: media.releaseSession,
    stopMedia: media.stopMedia,
  }),
  debateMediaSessionKey: (id: string) => `debate:${id}`,
  debateRequestMediaSessionKey: (id: string) => `debate-request:${id}`,
}));

vi.mock('./debate-video-tile', () => ({
  DebateVideoTile: ({ children, tileControls }: { children: React.ReactNode; tileControls: React.ReactNode }) => (
    <div data-testid="tile">
      {tileControls}
      {children}
    </div>
  ),
}));

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
  media.releaseSession.mockReset();
  media.beginSession.mockReset();
  media.stopMedia.mockReset();
  media.ensurePreview.mockReset().mockResolvedValue([]);
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(cleanup);

function choose(props: Partial<React.ComponentProps<typeof DebateRequestDialog>> = {}) {
  return (
    <DebateRequestDialog
      media={{ kind: 'choose', sessionKey: 'debate-request:req-1' }}
      claim="The protocol should ship debates"
      participants={participants}
      currentUserId="user-local"
      formatId="standard"
      busy={false}
      error={null}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      {...props}
    />
  );
}

function renderChoose(props: Partial<React.ComponentProps<typeof DebateRequestDialog>> = {}) {
  return render(choose(props));
}

describe('DebateRequestDialog', () => {
  it('states Open rounds as a floor when the request carries no cap', () => {
    render(
      <DebateRequestDialog
        media={{ kind: 'already-live' }}
        claim="The protocol should ship debates"
        participants={participants}
        currentUserId="user-local"
        formatId="open_rounds"
        openRounds={null}
        formatSummaryOnly
        busy={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'The protocol should ship debates' });
    expect(within(dialog).getByText('Open rounds · at least 2 min')).toBeInTheDocument();
    expect(within(dialog).queryByText(/2 min total/)).not.toBeInTheDocument();
  });

  it('states the Open rounds cap when the request carries one', () => {
    render(
      <DebateRequestDialog
        media={{ kind: 'already-live' }}
        claim="The protocol should ship debates"
        participants={participants}
        currentUserId="user-local"
        formatId="open_rounds"
        openRounds={{ max_rebuttal_rounds: 3, rebuttal_turn_ms: 45_000 }}
        formatSummaryOnly
        busy={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText('Open rounds · up to 6 min 30s total')).toBeInTheDocument();
  });

  it('releases the devices when a failed accept is followed by a dismissal', () => {
    const view = renderChoose();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    view.rerender(choose({ error: 'Could not accept the request.' }));
    expect(screen.getByText('Could not accept the request.')).toBeInTheDocument();

    view.unmount();

    expect(media.releaseSession).toHaveBeenCalledWith('debate-request:req-1');
  });

  it('keeps the devices alive when a retry succeeds after a failed accept', () => {
    const view = renderChoose();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    view.rerender(choose({ error: 'Could not accept the request.' }));

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    view.rerender(choose({ busy: true, error: null }));
    view.unmount();

    expect(media.releaseSession).not.toHaveBeenCalled();
  });

  it('keeps the devices alive when accepting hands them on', () => {
    const view = renderChoose();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    view.unmount();

    expect(media.releaseSession).not.toHaveBeenCalled();
  });

  it('keeps the devices alive when a pending accept settles with the card still mounted', () => {
    const view = renderChoose();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    view.rerender(choose({ busy: true }));
    view.rerender(choose({ busy: false }));
    view.unmount();

    expect(media.releaseSession).not.toHaveBeenCalled();
  });

  it('renders the canonical request layout and optional format selector', () => {
    const accept = vi.fn();
    const reject = vi.fn();
    const changeFormat = vi.fn();

    render(
      <DebateRequestDialog
        media={{ kind: 'already-live' }}
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
    // Named from each side, not from the `position_label` the fixtures carry. geo-chat's label
    // reads "Verify"/"Dispute" on a claim it still calls factual, and this dialog is the invitation
    // to debate a claim whose pills can only publish an Agree.
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Remote speaker').parentElement!).getByText('Disagree')).toBeInTheDocument();
    expect(within(dialog).queryByText('Yes')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('No')).not.toBeInTheDocument();
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
        media={{ kind: 'already-live' }}
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
    expect(within(remoteParticipant).getByText('Agree')).toBeInTheDocument();
    expect(within(remoteParticipant).getByAltText('Remote speaker')).toBeInTheDocument();
    expect(within(localParticipant).getByText('Disagree')).toBeInTheDocument();
    expect(within(localParticipant).getByAltText('Local speaker')).toBeInTheDocument();

    const localFirstTurn = within(dialog).getByText('You make an argument');
    const remoteFirstTurn = within(dialog).getByText('Remote speaker makes an argument');
    expect(localFirstTurn.compareDocumentPosition(remoteFirstTurn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('locks scrolling and surfaces busy and error states', () => {
    const { unmount } = render(
      <DebateRequestDialog
        media={{ kind: 'already-live' }}
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
