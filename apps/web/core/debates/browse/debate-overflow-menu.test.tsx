import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';

import { DebateOverflowMenu } from './debate-overflow-menu';

const mocks = vi.hoisted(() => ({
  isEditor: false,
  viewerUserId: null as string | null,
  personalSpaceId: null as string | null,
  mutate: vi.fn(),
  error: null as Error | null,
  isPending: false,
  toast: vi.fn(),
}));

vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ isEditor: mocks.isEditor, isMember: false, canEdit: mocks.isEditor, isLoading: false }),
}));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.viewerUserId,
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: false }),
}));
vi.mock('~/core/debates/use-debate-removal', () => ({
  useRemoveDebate: () => ({ mutate: mocks.mutate, error: mocks.error, isPending: mocks.isPending, reset: vi.fn() }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  mocks.isEditor = false;
  mocks.viewerUserId = null;
  mocks.personalSpaceId = null;
  mocks.mutate.mockReset();
  mocks.error = null;
  mocks.isPending = false;
});
afterEach(cleanup);

const debate = {
  id: '01a0448a-61d3-7101-8434-a20fdadf6f97',
  status: 'complete',
  claim: { space_id: 'claim-space' },
  participants: [{ user_id: 'user-a', profile_space_id: 'aaaa0000aaaa0000aaaa0000aaaa0000' }],
} as unknown as Debate;

function openDialog() {
  render(<DebateOverflowMenu debate={debate} variant="pill" />);
  fireEvent.click(screen.getByRole('button', { name: 'More debate options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove debate' }));
}

describe('DebateOverflowMenu (GEO-2785)', () => {
  it('is not drawn for a viewer who is neither a debater nor an editor', () => {
    mocks.viewerUserId = 'user-z';
    render(<DebateOverflowMenu debate={debate} variant="pill" />);
    expect(screen.queryByRole('button', { name: 'More debate options' })).not.toBeInTheDocument();
  });

  it.each([
    ['a participant', () => (mocks.viewerUserId = 'user-a')],
    ['an editor of the space', () => (mocks.isEditor = true)],
  ])('offers Remove debate to %s', (_, arrange) => {
    arrange();
    openDialog();
    expect(screen.getByRole('dialog', { name: 'Remove this debate?' })).toBeInTheDocument();
  });

  it('removes with the optional reason once confirmed', () => {
    mocks.viewerUserId = 'user-a';
    openDialog();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason (optional)' }), {
      target: { value: '  test recording  ' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove debate' }).at(-1)!);

    expect(mocks.mutate).toHaveBeenCalledWith('test recording', expect.any(Object));
  });

  it('sends no reason when none is given', () => {
    mocks.isEditor = true;
    openDialog();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove debate' }).at(-1)!);

    expect(mocks.mutate).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it('says why geo-chat refused', () => {
    mocks.isEditor = true;
    mocks.error = new GeoChatRequestError('no', 'debate_visibility_forbidden', 403);
    openDialog();

    expect(screen.getByRole('alert')).toHaveTextContent('Only a debater or an editor of this space');
  });
});
