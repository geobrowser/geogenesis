import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession } from './api';
import { ChallengeAcceptedPrompt } from './challenge-accepted-prompt';
import { registerLobbyCapture } from './lobbies/step-out';
import { clearRematchJoinIntents, readRematchJoinIntent, rememberRematchJoinIntent } from './rematch-join-intent';

const flags = vi.hoisted(() => ({ debateVideo: true, hydrating: false }));

// `hydrating` reproduces the real hook: false on a component's first render, the flag after.
vi.mock('~/core/state/feature-flags', async () => {
  const { useHydrated } = await import('~/core/hooks/use-hydrated');
  return {
    useFeatureFlag: (id: string) => {
      const hydrated = useHydrated();
      if (id !== 'debateVideo') return false;
      return flags.hydrating ? hydrated && flags.debateVideo : flags.debateVideo;
    },
  };
});

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
    joinChoiceRef: { current: null },
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
  flags.debateVideo = true;
  flags.hydrating = false;
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

let clearLobbyCapture: (() => void) | null = null;
afterEach(() => {
  cleanup();
  clearLobbyCapture?.();
  clearLobbyCapture = null;
});

describe('ChallengeAcceptedPrompt', () => {
  it('names who accepted', () => {
    renderPrompt();

    expect(screen.getByText('Remote speaker accepted your request')).toBeInTheDocument();
  });

  it('explains the join state as the microphone and camera are toggled', async () => {
    rememberRematchJoinIntent('rematch-1', { micOn: false, cameraOn: false, source: 'card' });
    const onExplore = vi.fn();
    renderPrompt({ onExplore });

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Join a live room together and pick a claim to debate.'
    );
    expect(screen.getByRole('region', { name: 'You' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Remote speaker' })).toBeInTheDocument();
    expect(await screen.findByText('You’ll join muted, with your camera off.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    expect(await screen.findByText('You’ll join muted. Remote speaker will see your camera.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
    expect(
      await screen.findByText('You’ll join with your mic on. Remote speaker will see your camera.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    expect(await screen.findByText('You’ll join with your mic on and your camera off.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(onExplore).toHaveBeenCalledOnce();
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

  // The sender is talking in a lobby: the card shows and saves the lobby's mic, opening none.
  it('saves a live lobby mic as on for the picker, without opening a second one', async () => {
    clearLobbyCapture = registerLobbyCapture('audio', { on: true, release: vi.fn() });
    renderPrompt();

    await waitFor(() =>
      expect(readRematchJoinIntent('rematch-1')).toEqual({ micOn: true, cameraOn: true, source: 'card' })
    );
    expect(media.ensurePreview).not.toHaveBeenCalledWith(expect.objectContaining({ audio: true }));
  });

  it('saves a muted lobby mic as muted', async () => {
    clearLobbyCapture = registerLobbyCapture('audio', { on: false, release: vi.fn() });
    renderPrompt();

    await waitFor(() => expect(readRematchJoinIntent('rematch-1')?.micOn).toBe(false));
  });

  it('does not overwrite a saved choice with the lobby’s state', async () => {
    rememberRematchJoinIntent('rematch-1', { micOn: true, cameraOn: false, source: 'card' });
    clearLobbyCapture = registerLobbyCapture('audio', { on: false, release: vi.fn() });
    renderPrompt();

    expect(await screen.findByRole('button', { name: 'Turn microphone off' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readRematchJoinIntent('rematch-1')).toEqual({ micOn: true, cameraOn: false, source: 'card' });
  });

  it('offers the mic alone and saves no camera choice with debateVideo off', async () => {
    flags.debateVideo = false;
    rememberRematchJoinIntent('rematch-1', { micOn: true, cameraOn: true, source: 'card' });
    renderPrompt();

    expect(await screen.findByText('You’ll join with your mic on.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
    await waitFor(() => expect(readRematchJoinIntent('rematch-1')).toStrictEqual({ micOn: true, source: 'card' }));
    expect(media.ensurePreview).not.toHaveBeenCalledWith(expect.objectContaining({ video: true }));
  });

  it('keeps a remembered camera through the flag reading off on the first render', async () => {
    flags.hydrating = true;
    rememberRematchJoinIntent('rematch-1', { micOn: true, cameraOn: true, source: 'card' });
    renderPrompt();

    expect(
      await screen.findByText('You’ll join with your mic on. Remote speaker will see your camera.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    await waitFor(() =>
      expect(readRematchJoinIntent('rematch-1')).toEqual({ micOn: true, cameraOn: true, source: 'card' })
    );
  });

  it('renders nothing when it cannot name both people', () => {
    renderPrompt({ session: { ...session, participants: [session.participants[0]!] } });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
