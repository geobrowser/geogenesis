import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rememberOwnRemoval } from '~/core/debates/debate-removal';

import { DebateRemovedView } from './debate-removed-view';

const mocks = vi.hoisted(() => ({
  isEditor: false,
  viewerUserId: null as string | null,
  mutate: vi.fn(),
  captured: [] as Array<{ event: string; properties: Record<string, unknown> }>,
}));

vi.mock('~/core/analytics', () => ({
  capture: (event: string, properties: Record<string, unknown> = {}) => mocks.captured.push({ event, properties }),
}));
vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ isEditor: mocks.isEditor, isMember: false, canEdit: mocks.isEditor, isLoading: false }),
}));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.viewerUserId,
}));
vi.mock('~/core/debates/use-debate-removal', () => ({
  useRestoreDebate: () => ({ mutate: mocks.mutate, error: null, isPending: false }),
}));

const DEBATE_ID = '01a0448a61d371018434a20fdadf6f97';

beforeEach(() => {
  window.localStorage.clear();
  mocks.isEditor = false;
  mocks.viewerUserId = null;
  mocks.mutate.mockReset();
  mocks.captured.length = 0;
});
afterEach(cleanup);

describe('DebateRemovedView (GEO-2785)', () => {
  it('shows only the neutral removed state to an ordinary viewer', () => {
    mocks.viewerUserId = 'user-z';
    render(<DebateRemovedView spaceId="space-1" debateId={DEBATE_ID} />);

    expect(screen.getByRole('heading', { name: 'This debate has been removed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('offers Restore to an editor', () => {
    mocks.isEditor = true;
    render(<DebateRemovedView spaceId="space-1" debateId={DEBATE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(mocks.mutate).toHaveBeenCalledOnce();
  });

  it('offers Restore to the person who removed it', () => {
    mocks.viewerUserId = 'user-a';
    rememberOwnRemoval(DEBATE_ID, 'user-a');
    render(<DebateRemovedView spaceId="space-1" debateId={DEBATE_ID} />);

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('reports the visit as unavailable because the debate was removed', () => {
    const view = render(<DebateRemovedView spaceId="space-1" debateId={DEBATE_ID} />);
    view.unmount();

    expect(mocks.captured).toEqual([
      {
        event: 'debate_page_outcome',
        properties: expect.objectContaining({
          debate_id: DEBATE_ID,
          outcome: 'not_played',
          reason: 'unavailable',
          detail: 'removed',
        }),
      },
    ]);
  });

  it('leaves reporting to the feed when the feed renders it', () => {
    const view = render(<DebateRemovedView spaceId="space-1" debateId={DEBATE_ID} reportOutcome={false} />);
    view.unmount();

    expect(mocks.captured).toEqual([]);
  });
});
