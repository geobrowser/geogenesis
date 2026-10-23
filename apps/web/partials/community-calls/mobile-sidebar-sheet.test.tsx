import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { MobileSidebarSheet } from './mobile-sidebar-sheet';
import { ParticipantsPanel } from './participants-panel';

const mocks = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@livekit/components-react', () => ({
  useParticipants: () => [
    { identity: 'participant-1', name: 'Ada', metadata: '{}', getTrackPublication: () => undefined },
  ],
  useMaybeRoomContext: () => null,
}));
vi.mock('~/core/community-calls/api', () => ({ removeParticipant: mocks.remove, muteParticipant: vi.fn() }));
vi.mock('~/core/community-calls/use-identity-token', () => ({
  useCommunityCallIdentityToken: () => ({ getToken: async () => 'identity-token' }),
}));
beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

it('keeps loaded participant moderation accessible and usable inside the real mobile modal', async () => {
  const user = userEvent.setup();
  render(
    <MobileSidebarSheet open onOpenChange={() => {}} title="People">
      <ParticipantsPanel roomName="call-1" livekitToken="join-token" canModerate />
    </MobileSidebarSheet>
  );
  const dialog = screen.getByRole('dialog', { name: 'People' });
  const trigger = within(dialog).getByRole('button');
  await user.click(trigger);
  const action = screen.getByRole('menuitem', { name: 'Remove from call' });
  expect(dialog).toContainElement(action);
  expect(action.closest('[aria-hidden="true"]')).toBeNull();
  expect(action.closest('.overflow-y-auto')).toBeNull();
  action.focus();
  expect(action).toHaveFocus();
  await user.click(action);
  expect(mocks.remove).toHaveBeenCalledWith(
    { room: 'call-1', identity: 'participant-1', livekitToken: 'join-token' },
    'identity-token'
  );
  expect(trigger).toHaveFocus();
});
