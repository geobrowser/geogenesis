import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

let permission: PermissionState = 'prompt';

beforeEach(() => {
  permission = 'prompt';
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: permission }) },
  });
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
    expect(row?.className).toContain('p-3');
  });

  /*
   * Nothing is framed while there is no picture. A 5:3 tile around a round avatar leaves a grey
   * band above and below it; the controls used to fill the lower one, and once they moved out it
   * was empty grey under the face.
   */
  it('draws no frame while the camera is off', async () => {
    renderDialog();

    await screen.findByRole('button', { name: /microphone/i });
    expect(document.querySelector('section[aria-label="You"]')).toBeNull();
  });

  /*
   * Switches sit under the preview: on this half-card tile they covered the face. Asserted
   * against the real tile, since a mock would pass with the controls anywhere.
   */
  it('keeps the switches under the preview once the camera is on', async () => {
    permission = 'granted';
    media.ensurePreview.mockResolvedValue([{ mediaStreamTrack: { kind: 'video' } }]);
    renderDialog();

    const tile = await waitFor(() => {
      const found = document.querySelector('section[aria-label="You"]');
      expect(found).not.toBeNull();
      return found;
    });
    const mic = screen.getByRole('button', { name: /microphone/i });

    expect(tile?.contains(mic)).toBe(false);
    expect(tile?.compareDocumentPosition(mic)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /*
   * And with the camera off there is no tile at all, so they follow the avatar rather than sitting
   * over it.
   */
  it('puts the switches under the avatar while the camera is off', async () => {
    renderDialog();

    const mic = await screen.findByRole('button', { name: /microphone/i });
    expect(document.querySelector('section[aria-label="You"]')).toBeNull();
    const avatar = document.querySelector('[class*="overflow-hidden"][class*="rounded-full"]');
    expect(avatar?.compareDocumentPosition(mic)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // The card still offers the choice, which is what puts the permission prompt before the call
  // rather than in the middle of one.
  it('still offers the camera and microphone toggles', async () => {
    renderDialog();

    expect(await screen.findByRole('button', { name: /microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera/i })).toBeInTheDocument();
  });
});
