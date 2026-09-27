import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonDebatesTab } from './person-debates-tab';

const PROFILE_SPACE = '11111111111111111111111111111111';
const OTHER_SPACE = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  personalSpaceId: '11111111111111111111111111111111' as string | null,
  debates: {
    rows: [] as { entityId: string; spaceId: string }[],
    hiddenRows: [] as { entityId: string; spaceId: string }[],
    hiddenRelationsByDebateId: new Map(),
    isLoading: false,
    isError: false,
  },
  setHidden: vi.fn(),
}));

vi.mock('~/core/debates/matchmaking/filter-switch', () => ({
  FilterSwitch: ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      {label}
    </button>
  ),
}));

vi.mock('~/core/debates/use-person-debates', () => ({ usePersonDebates: () => mocks.debates }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: false }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map() }),
  spaceLabel: () => ({ name: 'Space', image: null }),
}));
vi.mock('~/core/profile/use-entity-scores', () => ({
  useEntityScores: () => ({ scores: new Map(), rankings: new Map(), isLoading: false, isError: false }),
}));
vi.mock('~/core/profile/use-profile-debate-visibility', () => ({
  useProfileDebateVisibility: () => ({ setHidden: mocks.setHidden, pendingIds: new Set() }),
}));
vi.mock('./use-record-selection', () => ({
  useRecordSelection: () => ({ values: [], toggle: vi.fn(), clear: vi.fn(), replace: vi.fn() }),
}));
vi.mock('./record-filter-row', () => ({
  RecordFilterRow: ({ end }: { end?: React.ReactNode }) => <div data-testid="filter-row">{end}</div>,
}));
vi.mock('./person-record-feed', () => ({
  PersonRecordFeed: ({ rows }: { rows: { entityId: string }[] }) => (
    <div data-testid="feed">{rows.map(row => row.entityId).join(',')}</div>
  ),
}));

beforeEach(() => {
  mocks.personalSpaceId = PROFILE_SPACE;
  mocks.debates = {
    rows: [{ entityId: 'visible-debate', spaceId: OTHER_SPACE }],
    hiddenRows: [],
    hiddenRelationsByDebateId: new Map(),
    isLoading: false,
    isError: false,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PersonDebatesTab hidden view', () => {
  it('keeps Show hidden available to the owner when the current hidden count is empty', () => {
    render(<PersonDebatesTab spaceId={PROFILE_SPACE} />);

    expect(screen.getByRole('switch', { name: 'Show hidden' })).toHaveAttribute('aria-checked', 'false');
  });

  it('switches the owner between public and hidden debates', () => {
    mocks.debates.hiddenRows = [{ entityId: 'hidden-debate', spaceId: OTHER_SPACE }];
    render(<PersonDebatesTab spaceId={PROFILE_SPACE} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Show hidden (1)' }));

    expect(screen.getByTestId('feed')).toHaveTextContent('hidden-debate');
    expect(screen.getByRole('switch', { name: 'Show hidden (1)' })).toHaveAttribute('aria-checked', 'true');
  });

  it('follows same-route hidden query changes in both directions', async () => {
    mocks.debates.hiddenRows = [{ entityId: 'hidden-debate', spaceId: OTHER_SPACE }];
    const { rerender } = render(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially={false} />);
    expect(screen.getByTestId('feed')).toHaveTextContent('visible-debate');

    rerender(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially />);
    await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('hidden-debate'));

    rerender(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially={false} />);
    await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('visible-debate'));
  });

  it('does not expose hidden debates when a visitor appends the owner deep link', () => {
    mocks.personalSpaceId = OTHER_SPACE;
    mocks.debates.hiddenRows = [{ entityId: 'hidden-debate', spaceId: OTHER_SPACE }];

    render(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially />);

    expect(screen.queryByRole('switch', { name: /Show hidden/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('feed')).toHaveTextContent('visible-debate');
    expect(screen.getByTestId('feed')).not.toHaveTextContent('hidden-debate');
  });

  it('returns to the public list after the owner restores the last hidden debate', async () => {
    mocks.debates.hiddenRows = [{ entityId: 'hidden-debate', spaceId: OTHER_SPACE }];
    const { rerender } = render(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially />);
    expect(screen.getByTestId('feed')).toHaveTextContent('hidden-debate');

    mocks.debates.hiddenRows = [];
    rerender(<PersonDebatesTab spaceId={PROFILE_SPACE} showHiddenInitially />);

    await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('visible-debate'));
    expect(screen.getByRole('switch', { name: 'Show hidden' })).toHaveAttribute('aria-checked', 'false');
  });
});
