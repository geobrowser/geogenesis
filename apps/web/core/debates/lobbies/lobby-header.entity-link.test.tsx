import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobbyHeader } from './lobby-header';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ flag: false }));
vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  useFeatureFlag: (id: string) => (id === 'spaceCalls' ? mocks.flag : false),
}));
vi.mock('~/core/analytics', () => ({ capture: vi.fn(), analyticsContextRevision: () => 0 }));
vi.mock('./hooks', () => ({
  useEndDebateLobby: () => ({}),
  useUpdateDebateLobby: () => ({ mutate: vi.fn(), error: null, isPending: false }),
}));
vi.mock('./lobby-moderation', () => ({ LobbyHostLists: () => null }));

const call = (entityId: string | null) =>
  ({
    lobby_id: '11111111111141118111111111111111',
    name: 'A call',
    members: [],
    access: { status: 'admitted' },
    viewer: { kind: 'guest', role: null, hosting: false },
    call: { space_id: 'a'.repeat(32), space_name: 'Crypto', entity_id: entityId },
  }) as unknown as LobbyPageView;

const metaLine = (lobby: LobbyPageView) => {
  const { container } = render(<LobbyHeader lobby={lobby} phone={false} availability={null} />);
  return container.querySelector('header > div')!.children[2]!.outerHTML;
};

afterEach(() => {
  cleanup();
  mocks.flag = false;
});

describe('LobbyHeader call entity link', () => {
  it('keeps the meta line as it was unless the link shows', () => {
    const plain = metaLine(call(null));
    cleanup();
    expect(metaLine(call('b'.repeat(32)))).toBe(plain);
    cleanup();
    mocks.flag = true;
    expect(metaLine(call(null))).toBe(plain);
    expect(plain).not.toContain('<span');
  });

  it('adds the link beside the meta text behind spaceCalls once an entity is recorded', () => {
    mocks.flag = true;
    const { getByTestId } = render(<LobbyHeader lobby={call('b'.repeat(32))} phone={false} availability={null} />);
    expect(getByTestId('call-entity-link').getAttribute('href')).toContain('b'.repeat(32));
  });
});
