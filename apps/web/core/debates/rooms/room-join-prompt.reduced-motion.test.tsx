import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { UpcomingDebateRoom } from '../api';

// Framer reads the preference once, on first use, so it has to be in place before anything renders.
// Its own file for that reason: every render in here runs as someone who has turned motion off.
window.matchMedia = ((query: string) => ({
  // Framer asks for bare `(prefers-reduced-motion)`, not `: reduce`.
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as typeof window.matchMedia;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./room-opponent', async importOriginal => ({
  ...(await importOriginal<typeof import('./room-opponent')>()),
  useUpcomingRoomOpponent: () => null,
}));
vi.mock('../matchmaking/use-request-countdown', () => ({
  useServerClock: () => ({ now: () => Date.parse('2026-09-21T08:52:00.000Z') }),
}));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => <span /> }));

const { DebateRoomJoinPrompt } = await import('./room-join-prompt');

const ROOM: UpcomingDebateRoom = {
  room_id: 'room-1',
  starts_at: '2026-09-21T09:00:00.000Z',
  opens_at: '2026-09-21T08:50:00.000Z',
  joinable: true,
  due: false,
  others_present: false,
  rematch_session_id: null,
};

describe('DebateRoomJoinPrompt with reduced motion', () => {
  // The banner is mounted app-wide, outside the hub's own MotionConfig, so it needs its own.
  // Well inside the 200ms slide: with motion on, it would still be part-way down here.
  it('arrives without sliding in', async () => {
    render(<DebateRoomJoinPrompt room={ROOM} onNotNow={vi.fn()} />);
    const card = screen.getByText('Your debate room is open').closest('.shadow-card') as HTMLElement;

    await act(() => new Promise(resolve => setTimeout(resolve, 30)));

    expect(card.style.transform).not.toMatch(/translateY/);
  });
});
