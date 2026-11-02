import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../hooks', () => ({
  useDebateSchedule: () => ({ data: undefined }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../rooms/scheduling-hooks', () => ({ useScheduledDebates: () => ({ data: undefined }) }));
vi.mock('~/partials/availability/availability-modal', () => ({
  AvailabilityModal: ({ open }: { open: boolean }) => (open ? <div>editor open</div> : null),
}));

const { AvailabilityRequestNotice } = await import('./availability-request-notice');

const request = (kind: 'no_availability' | 'more_times') => ({
  kind,
  requested_by_name: 'Sam',
  requested_at: '2026-10-10T10:00:00Z',
  expires_at: '2026-10-24T10:00:00Z',
});

describe('AvailabilityRequestNotice', () => {
  afterEach(cleanup);

  it('renders nothing without a request', () => {
    const { container } = render(<AvailabilityRequestNotice requests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for more times and opens the editor', () => {
    render(<AvailabilityRequestNotice requests={[request('more_times')]} />);
    expect(screen.getByText(/Sam would like to set up a debate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add more times' }));
    expect(screen.getByText('editor open')).toBeInTheDocument();
  });

  it('asks for availability when there is none', () => {
    render(<AvailabilityRequestNotice requests={[request('no_availability')]} />);
    expect(screen.getByRole('button', { name: 'Set availability' })).toBeInTheDocument();
  });
});
