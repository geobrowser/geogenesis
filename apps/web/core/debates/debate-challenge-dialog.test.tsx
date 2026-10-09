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

  it('does not pin the height of the row holding the preview', () => {
    renderDialog();

    const row = document.querySelector('[class*="grid-cols-[1fr_auto_1fr]"]');
    expect(row).not.toBeNull();
    expect(row?.className).toContain('min-h-24');
    expect(row?.className.split(/\s+/)).not.toContain('h-24');
  });

  /*
   * The switches sit under the tile, not on it. Two 40px circles over a tile this size covered the
   * avatar they belong to — and while the camera is off that avatar is the only thing saying whose
   * tile it is.
   *
   * Asserted against the real tile, which renders `tileControls` as an overlay inside itself: a
   * test with the tile mocked passes wherever the buttons are, which is how the controls once
   * ended up clipped out of sight while every behavioural test was green.
   */
  it('puts the switches below the tile rather than over the avatar', async () => {
    renderDialog();

    const mic = await screen.findByRole('button', { name: /microphone/i });
    const tile = document.querySelector('section[aria-label="You"]');
    expect(tile).not.toBeNull();
    expect(tile?.contains(mic)).toBe(false);
    // And after it in the document, so it reads as a caption to the tile.
    expect(tile?.compareDocumentPosition(mic)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // The card still offers the choice, which is what puts the permission prompt before the call
  // rather than in the middle of one.
  it('still offers the camera and microphone toggles', async () => {
    renderDialog();

    expect(await screen.findByRole('button', { name: /microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera/i })).toBeInTheDocument();
  });
});
