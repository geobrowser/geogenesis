import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession } from './api';
import { ChallengeAcceptedPrompt } from './challenge-accepted-prompt';
import { clearRematchJoinIntents, readRematchJoinIntent } from './rematch-join-intent';

const media = vi.hoisted(() => ({
  releaseSession: vi.fn(),
  beginSession: vi.fn(),
  stopMedia: vi.fn(),
  ensurePreview: vi.fn(),
}));

// Only the hook is replaced; the rest of the module is real, including the failure copy.
vi.mock('./media-session', async importOriginal => ({
  ...(await importOriginal<typeof import('./media-session')>()),
  useOptionalDebateMediaSession: () => ({
    previewState: 'idle',
    previewError: null,
    previewStream: null,
    localTracksRef: { current: [{ mediaStreamTrack: { kind: 'audio' } }, { mediaStreamTrack: { kind: 'video' } }] },
    ensurePreview: media.ensurePreview,
    beginSession: media.beginSession,
    releaseSession: media.releaseSession,
    stopMedia: media.stopMedia,
  }),
}));

const session = {
  id: 'rematch-1',
  source_debate_id: null,
  source_space_id: 'space-1',
  status: 'browsing',
  participants: [
    {
      user_id: 'user-requester',
      profile_space_id: 'profile-requester',
      display_name: 'You',
      avatar_cid: null,
      participant_slot: 1,
      consented_at: null,
    },
    {
      user_id: 'user-recipient',
      profile_space_id: 'profile-recipient',
      display_name: 'Remote speaker',
      avatar_cid: null,
      participant_slot: 2,
      consented_at: null,
    },
  ],
  decision_expires_at: '2026-07-02T00:00:20.000Z',
  browsing_expires_at: null,
  request: null,
  converted_debate_id: null,
  recently_rejected_claim_ids: [],
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
} as DebateRematchSession;

function renderPrompt(props: Partial<React.ComponentProps<typeof ChallengeAcceptedPrompt>> = {}) {
  return render(
    <ChallengeAcceptedPrompt
      session={session}
      currentUserId="user-requester"
      busy={false}
      error={null}
      onExplore={vi.fn()}
      onDecline={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  clearRematchJoinIntents();
  media.beginSession.mockReset();
  media.releaseSession.mockReset();
  media.stopMedia.mockReset();
  media.ensurePreview
    .mockReset()
    .mockImplementation(async (options: { audio?: boolean; video?: boolean } = {}) =>
      [
        (options.audio ?? true) ? { mediaStreamTrack: { kind: 'audio' } } : null,
        (options.video ?? true) ? { mediaStreamTrack: { kind: 'video' } } : null,
      ].filter(Boolean)
    );
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'granted' }) },
  });
});

afterEach(cleanup);

describe('ChallengeAcceptedPrompt', () => {
  it('names who accepted', () => {
    renderPrompt();

    expect(screen.getByText('Remote speaker accepted your request')).toBeInTheDocument();
  });

  it('offers the microphone and the camera', async () => {
    renderPrompt();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /microphone/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /camera/i })).toBeInTheDocument();
    });
  });

  it('records and keeps the camera choice across an unmount and remount', async () => {
    const view = renderPrompt();

    await screen.findByRole('button', { name: 'Turn camera off' });
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.cameraOn).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.cameraOn).toBe(false));

    view.unmount();
    media.ensurePreview.mockClear();
    renderPrompt();

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readRematchJoinIntent('rematch-1')?.cameraOn).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
  });

  it('keeps a muted choice across an unmount and remount', async () => {
    const view = renderPrompt();

    // Opened on arrival, because the browser already allows it.
    await screen.findByRole('button', { name: 'Turn microphone off' });
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.micOn).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.micOn).toBe(false));

    // Away, and back. Cleared so what follows is about the remount alone.
    view.unmount();
    media.ensurePreview.mockClear();
    renderPrompt();

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readRematchJoinIntent('rematch-1')?.micOn).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn microphone on' })).toBeInTheDocument();
    // And nothing was opened to get there.
    expect(media.ensurePreview).not.toHaveBeenCalledWith(expect.objectContaining({ audio: true }));
  });

  it('keeps a mic-on choice across an unmount and remount', async () => {
    const view = renderPrompt();
    await screen.findByRole('button', { name: 'Turn microphone off' });
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.micOn).toBe(true));

    view.unmount();
    renderPrompt();

    expect(await screen.findByRole('button', { name: 'Turn microphone off' })).toBeInTheDocument();
  });

  it('renders nothing when it cannot name both people', () => {
    renderPrompt({ session: { ...session, participants: [session.participants[0]!] } });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
