import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import type { SpaceCallsResponse } from './api';

const mocks = vi.hoisted(() => ({
  flag: true,
  calls: undefined as SpaceCallsResponse | undefined,
  push: vi.fn(),
  mutate: vi.fn(),
  start: { isPending: false, isError: false, error: null as unknown },
  listEnabled: [] as boolean[],
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock('./hooks', () => ({
  useSpaceCalls: () => {
    mocks.listEnabled.push(true);
    return { data: mocks.calls };
  },
  useStartSpaceCall: () => ({ ...mocks.start, mutate: mocks.mutate }),
}));

const { SpaceCallEntry } = await import('./space-call-entry');

afterEach(() => {
  cleanup();
  mocks.flag = true;
  mocks.calls = undefined;
  mocks.push.mockReset();
  mocks.mutate.mockReset();
  mocks.start = { isPending: false, isError: false, error: null };
  mocks.listEnabled = [];
});

const live = {
  call_id: 'call1',
  name: 'Weekly call',
  started_at: '2026-10-23T15:00:02Z',
  started_by: null,
  hosts: [],
  headcount: 7,
  avatars: [],
  as_of: '2026-10-23T15:04:11Z',
};

describe('SpaceCallEntry', () => {
  it('draws and reads nothing with the flag off', () => {
    mocks.flag = false;
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [live] };
    const { container } = render(<SpaceCallEntry spaceId="space1" />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.listEnabled).toEqual([]);
  });

  it('links anyone to the live call', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: null, calls: [live] };
    render(<SpaceCallEntry spaceId="space1" />);
    const link = screen.getByRole('link', { name: 'Join Weekly call' });
    expect(link).toHaveAttribute('href', '/space/space1/calls/call1');
    expect(link).toHaveTextContent('Live call · 7');
  });

  it('offers an editor Start call, and opens the call it started', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [] };
    render(<SpaceCallEntry spaceId="space1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const [, options] = mocks.mutate.mock.calls[0]!;
    options.onSuccess({ lobby_id: 'new-call' });
    expect(mocks.push).toHaveBeenCalledWith('/space/space1/calls/new-call');
  });

  it('joins the call someone else started first', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [] };
    render(<SpaceCallEntry spaceId="space1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    const [, options] = mocks.mutate.mock.calls[0]!;
    options.onError(new GeoChatRequestError('live', 'call_already_live', 409, null, { call_id: 'theirs' }));
    expect(mocks.push).toHaveBeenCalledWith('/space/space1/calls/theirs');
  });

  it('shows nothing to a non-editor with no call on, or in a space without calls', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: false, calls: [] };
    const { container, rerender } = render(<SpaceCallEntry spaceId="space1" />);
    expect(container).toBeEmptyDOMElement();
    mocks.calls = { space_id: 'space1', supported: false, viewer_can_start: true, calls: [] };
    rerender(<SpaceCallEntry spaceId="space1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says why a start failed', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [] };
    mocks.start = {
      isPending: false,
      isError: true,
      error: new GeoChatRequestError('no', 'call_editor_required', 403),
    };
    render(<SpaceCallEntry spaceId="space1" />);
    expect(screen.getByText('Only editors of this space can start a call.')).toBeInTheDocument();
  });
});
