import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({ screens: undefined as Map<string, unknown> | undefined }));

vi.mock('~/core/debates/lobbies/lobby-voice', () => ({
  useLobbyVoiceStates: () => ({ screens: mocks.screens }),
}));
vi.mock('~/core/debates/track-video', () => ({
  TrackVideo: ({ track }: { track: { id: string } }) => <video data-testid="call-screen-video" data-track={track.id} />,
}));

const { CallScreenStage, nextScreenShares, shownScreenShare, useScreenShareChoice, NO_SCREEN_SHARES } =
  await import('./call-screen-stage');

const member = (id: string, name: string) =>
  ({
    user_id: id,
    display_name: name,
    avatar_cid: null,
    profile_space_id: `space-${id}`,
  }) as unknown as DebateLobbyMember;
const MEMBERS = [member('ada', 'Ada'), member('ben', 'Ben'), member('cy', 'Cy')];

function share(...ids: string[]) {
  mocks.screens = new Map(ids.map(id => [id, { publication: { track: { id } } }]));
}

function Picker() {
  const choice = useScreenShareChoice();
  return (
    <button type="button" onClick={() => choice?.show('ada')}>
      tile {choice?.shown}
    </button>
  );
}

function renderStage() {
  const ui = () => (
    <CallScreenStage members={MEMBERS}>
      <Picker />
    </CallScreenStage>
  );
  const result = render(ui());
  return { rerender: () => result.rerender(ui()) };
}

const shown = () => screen.getByTestId('call-screen-video').getAttribute('data-track');
const chip = (name: string) => screen.getByRole('button', { name: `Show ${name}’s screen` });

beforeEach(() => {
  mocks.screens = undefined;
});
afterEach(cleanup);

describe('nextScreenShares', () => {
  it('adds new sharers last and drops ended ones', () => {
    const first = nextScreenShares(NO_SCREEN_SHARES, ['ada', 'ben']);
    expect(first.order).toEqual(['ada', 'ben']);
    expect(nextScreenShares(first, ['cy', 'ben', 'ada']).order).toEqual(['ada', 'ben', 'cy']);
    expect(nextScreenShares(first, ['ben']).order).toEqual(['ben']);
  });

  it('returns the same state when nothing changed', () => {
    const state = { order: ['ada', 'ben'], picked: 'ada' };
    expect(nextScreenShares(state, ['ben', 'ada'])).toBe(state);
  });

  it('drops a pick whose share ended', () => {
    expect(nextScreenShares({ order: ['ada', 'ben'], picked: 'ada' }, ['ben']).picked).toBeNull();
  });

  it('shows the pick, else the most recent', () => {
    expect(shownScreenShare({ order: ['ada', 'ben'], picked: null })).toBe('ben');
    expect(shownScreenShare({ order: ['ada', 'ben'], picked: 'ada' })).toBe('ada');
    expect(shownScreenShare(NO_SCREEN_SHARES)).toBeNull();
  });
});

describe('CallScreenStage', () => {
  it('draws only its children while nobody shares', () => {
    renderStage();
    expect(screen.queryByTestId('call-screen-stage')).toBeNull();
    expect(screen.getByRole('button', { name: /tile/ })).toBeInTheDocument();
  });

  it('shows a lone share without chips', () => {
    share('ada');
    renderStage();
    expect(screen.getByRole('region', { name: 'Ada is sharing their screen' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Shared screens' })).toBeNull();
  });

  it('shows the most recent of several shares, with a chip per sharer', () => {
    share('ada');
    const { rerender } = renderStage();
    share('ada', 'ben');
    rerender();

    expect(shown()).toBe('ben');
    const chips = within(screen.getByRole('list', { name: 'Shared screens' })).getAllByRole('button');
    expect(chips.map(button => button.textContent)).toEqual(['Ada', 'Ben']);
    expect(chip('Ben')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Ada')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to a picked share and keeps it when another starts', () => {
    share('ada', 'ben');
    const { rerender } = renderStage();
    fireEvent.click(chip('Ada'));
    expect(shown()).toBe('ada');
    expect(screen.getByRole('region', { name: 'Ada is sharing their screen' })).toBeInTheDocument();

    share('ada', 'ben', 'cy');
    rerender();
    expect(shown()).toBe('ada');
  });

  it('follows a new share while the viewer has not picked one', () => {
    share('ada');
    const { rerender } = renderStage();
    share('ada', 'ben');
    rerender();
    expect(shown()).toBe('ben');
  });

  it('falls back to the most recent remaining share when the picked one ends', () => {
    share('ada', 'ben', 'cy');
    const { rerender } = renderStage();
    fireEvent.click(chip('Ada'));
    share('ben', 'cy');
    rerender();
    expect(shown()).toBe('cy');

    // The pick went with its share, so a new share shows again.
    share('ben', 'cy', 'ada');
    rerender();
    expect(shown()).toBe('ada');
  });

  it('lets the people below switch the stage', () => {
    share('ada', 'ben');
    renderStage();
    expect(screen.getByRole('button', { name: 'tile ben' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tile ben' }));
    expect(shown()).toBe('ada');
    expect(screen.getByRole('button', { name: 'tile ada' })).toBeInTheDocument();
  });

  describe('full screen', () => {
    beforeEach(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    });
    afterEach(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { value: undefined, configurable: true });
    });

    it('fills the screen with the picked share', async () => {
      share('ada', 'ben');
      renderStage();
      fireEvent.click(chip('Ada'));
      const requestFullscreen = vi.fn(async () => undefined);
      const frame = screen.getByTestId('call-screen-video').parentElement!;
      frame.requestFullscreen = requestFullscreen;

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Full screen' })));
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      expect(within(frame).getByTestId('call-screen-video')).toHaveAttribute('data-track', 'ada');
    });
  });
});
