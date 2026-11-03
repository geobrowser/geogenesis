import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ makeProposal: vi.fn(), updateOps: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/hooks/use-access-control', () => ({ useAccessControl: () => ({ isEditor: true, isLoading: false }) }));
vi.mock('~/core/community-calls/use-identity-token', () => ({
  useCommunityCallIdentityToken: () => ({ getToken: vi.fn() }),
}));
vi.mock('~/core/community-calls/constants', () => ({
  CALL_SCHEMA: { COMMUNITY_CALL_TYPE: 'type', MEETING_TIME_PROPERTY: 'time' },
}));
vi.mock('~/core/community-calls/call-ops', () => ({
  buildCreateCallOps: vi.fn(),
  buildUpdateCallOps: (args: unknown) => {
    mocks.updateOps(args);
    return { values: [], relations: [] };
  },
}));
vi.mock('~/core/space-calls/series/after-publish', () => ({ useAfterSeriesPublish: () => vi.fn() }));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => true }));

const { CallForm } = await import('./call-form');

afterEach(() => {
  cleanup();
  mocks.makeProposal.mockReset();
  mocks.updateOps.mockReset();
});

function edit(schedule: string) {
  render(
    <CallForm
      mode="edit"
      spaceId="space1"
      callId="call1"
      initial={{ name: 'Weekly', description: '', schedule, autoPublishAhead: 0 }}
    />
  );
}

function renameAndSave() {
  fireEvent.change(screen.getByPlaceholderText('Community call name'), { target: { value: 'Weekly sync' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
}

describe('CallForm editing a schedule', () => {
  it('shows a series’ own zone and saves a rename with the schedule as stored', () => {
    const schedule =
      'DTSTART;TZID=Africa/Lagos:20261103T180000\nDTEND;TZID=Africa/Lagos:20261103T190000\nRRULE:FREQ=WEEKLY';
    edit(schedule);
    expect(screen.getByDisplayValue('18:00')).toBeInTheDocument();
    expect(screen.getByText(/^Start time \((GMT\+1|WAT)\)$/)).toBeInTheDocument();
    renameAndSave();
    expect(mocks.updateOps).toHaveBeenCalledWith(expect.objectContaining({ name: 'Weekly sync', schedule }));
  });

  it('shows a schedule it cannot edit read-only and keeps it', () => {
    const schedule = 'DTSTART:20261103T170000Z\nRRULE:FREQ=WEEKLY;COUNT=4';
    edit(schedule);
    expect(screen.getByTestId('call-form-schedule-locked')).toHaveTextContent('kept as it is');
    expect(screen.queryByText(/^Start date/)).not.toBeInTheDocument();
    renameAndSave();
    expect(mocks.updateOps).toHaveBeenCalledWith(expect.objectContaining({ schedule }));
  });
});
