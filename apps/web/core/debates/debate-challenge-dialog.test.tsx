import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateChallenge } from './api';
import { DebateChallengeDialog } from './debate-challenge-dialog';

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
  debateChallengeMediaSessionKey: (id: string) => `debate-challenge:${id}`,
}));

vi.mock('./debate-video-tile', () => ({
  DebateVideoTile: ({ children, tileControls }: { children: React.ReactNode; tileControls: React.ReactNode }) => (
    <div data-testid="tile">
      {tileControls}
      {children}
    </div>
  ),
}));

const challenge: DebateChallenge = {
  id: 'challenge-1',
  status: 'pending',
  source_space_id: 'space-1',
  requester: {
    user_id: 'user-remote',
    profile_space_id: 'profile-remote',
    display_name: 'Remote speaker',
    avatar_cid: null,
  },
  recipient: {
    user_id: 'user-local',
    profile_space_id: 'profile-local',
    display_name: 'Local speaker',
    avatar_cid: null,
  },
  rematch_session_id: null,
  created_at: '2026-10-08T00:00:00Z',
  expires_at: '2026-10-08T01:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof DebateChallengeDialog>> = {}) {
  return render(
    <DebateChallengeDialog
      challenge={challenge}
      busy={false}
      error={null}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onNotNow={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  media.releaseSession.mockReset();
  media.beginSession.mockReset();
  media.stopMedia.mockReset();
  media.ensurePreview.mockReset().mockResolvedValue([]);
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(cleanup);

describe('DebateChallengeDialog', () => {
  /*
   * Unlike a request, accepting a challenge leads to the claim picker rather than to a room, and
   * nothing on that route claims the media session. Devices held open past this card would stay
   * open, unowned, with nothing on screen accounting for the camera light — so this card stops them
   * whichever way it closes, and leaves only the permission behind.
   */
  it('stops the devices when the challenge is accepted', () => {
    const view = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Explore claims' }));
    view.unmount();

    expect(media.releaseSession).toHaveBeenCalledWith('debate-challenge:challenge-1');
  });

  it('stops the devices when the card is dismissed', () => {
    const view = renderDialog();

    view.unmount();

    expect(media.releaseSession).toHaveBeenCalledWith('debate-challenge:challenge-1');
  });

  it('stops the devices when a failed accept is followed by a dismissal', () => {
    const view = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Explore claims' }));
    view.rerender(
      <DebateChallengeDialog
        challenge={challenge}
        busy={false}
        error="Could not accept the request."
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onNotNow={vi.fn()}
      />
    );
    expect(screen.getByText('Could not accept the request.')).toBeInTheDocument();
    view.unmount();

    expect(media.releaseSession).toHaveBeenCalledWith('debate-challenge:challenge-1');
  });

  // The card still offers the choice, which is what puts the permission prompt before the call
  // rather than in the middle of one.
  it('still offers the camera and microphone toggles', async () => {
    renderDialog();

    expect(await screen.findByRole('button', { name: /microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera/i })).toBeInTheDocument();
  });
});
