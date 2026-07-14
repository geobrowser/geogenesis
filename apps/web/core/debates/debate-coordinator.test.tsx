import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateSharePrompt } from './api';
import { DebateCoordinator } from './debate-coordinator';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  activity: null as DebateActivity | null,
  pathname: '/space/space-1/debates',
  prompts: [] as DebateSharePrompt[],
  mediaMutate: vi.fn(),
  handleMutate: vi.fn(),
  clipboardWrite: vi.fn(),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock('./hooks', () => ({
  useDebatePresenceHeartbeat: vi.fn(),
  useDebateActivity: () => ({ data: mocks.activity }),
  useDebateSharePrompts: () => ({ data: { prompts: mocks.prompts } }),
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaMutate, error: null }),
  useHandleDebateSharePrompt: () => ({ mutate: mocks.handleMutate, isPending: false }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('./match-prompt', () => ({
  DebateMatchPrompt: () => <div>Global match prompt</div>,
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.mediaMutate.mockReset();
  mocks.handleMutate.mockReset();
  mocks.clipboardWrite.mockReset();
  mocks.play.mockClear();
  mocks.pause.mockClear();
  mocks.activity = null;
  mocks.pathname = '/space/space-1/debates';
  mocks.prompts = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.clipboardWrite },
  });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: mocks.play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: mocks.pause,
  });
});

afterEach(cleanup);

describe('DebateCoordinator', () => {
  it('routes an available participant into a shared rematch browser', async () => {
    mocks.activity = activityWithRematch('browsing');

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('waits for the debate room to finalize its recording before routing to a rematch', async () => {
    mocks.pathname = '/space/space-1/debates/debate-1';
    mocks.activity = activityWithRematch('browsing');

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).not.toHaveBeenCalled());
  });

  it('does not route stale debate activity over an active rematch page', async () => {
    mocks.pathname = '/space/space-1/debates/rematches/rematch-1';
    mocks.activity = {
      online: true,
      cooldown_until: null,
      match: null,
      debate: {
        id: 'debate-1',
        claim: { space_id: 'space-1' },
      } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).not.toHaveBeenCalled());
  });

  it('copies a stable recording link when native sharing is unavailable', async () => {
    mocks.activity = { online: true, cooldown_until: null, match: null, debate: null, rematch: null };
    mocks.prompts = [
      {
        id: 'prompt-1',
        debate_id: 'debate-1',
        source_space_id: 'space-1',
        claim: 'Debates are useful',
        created_at: '2026-07-02T00:00:00.000Z',
      },
    ];
    mocks.mediaMutate.mockImplementation((variables, options) => {
      const url =
        variables.request.kind === 'preview_image' ? 'https://video.test/preview.jpg' : 'https://video.test/final.mp4';
      options.onSuccess({ upload: { url } });
    });
    mocks.clipboardWrite.mockResolvedValue(undefined);

    render(<DebateCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(mocks.clipboardWrite).toHaveBeenCalledWith(
        `${window.location.origin}/space/space-1/debates/debate-1/recording`
      )
    );
    expect(mocks.handleMutate).toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' });
  });

  it('uses the generated preview and loads the share video only after play', async () => {
    mocks.activity = { online: true, cooldown_until: null, match: null, debate: null, rematch: null };
    mocks.prompts = [
      {
        id: 'prompt-1',
        debate_id: 'debate-1',
        source_space_id: 'space-1',
        claim: 'Debates are useful',
        created_at: '2026-07-02T00:00:00.000Z',
      },
    ];
    mocks.mediaMutate.mockImplementation((variables, options) => {
      const url =
        variables.request.kind === 'preview_image' ? 'https://video.test/preview.jpg' : 'https://video.test/final.mp4';
      options.onSuccess({ upload: { url } });
    });

    const { container } = render(<DebateCoordinator />);

    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('poster', 'https://video.test/preview.jpg')
    );
    expect(mocks.mediaMutate.mock.calls.some(([variables]) => variables.request.kind === 'final_video')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Play Processed video for Debates are useful' }));

    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://video.test/final.mp4')
    );
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });
});

function activityWithRematch(status: 'deciding' | 'browsing'): DebateActivity {
  return {
    online: true,
    cooldown_until: null,
    match: null,
    debate: null,
    rematch: {
      id: 'rematch-1',
      source_debate_id: 'debate-1',
      source_space_id: 'space-1',
      status,
      participants: [],
      decision_expires_at: '2026-07-02T00:00:20.000Z',
      browsing_expires_at: null,
      request: null,
      converted_debate_id: null,
      recently_rejected_claim_ids: [],
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    },
  };
}
