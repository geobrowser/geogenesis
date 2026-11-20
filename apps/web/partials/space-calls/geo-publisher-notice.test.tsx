import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GEO_PUBLISHER_NOTICE_COPY, GeoPublisherNotice } from './geo-publisher-notice';

const mocks = vi.hoisted(() => ({
  state: 'add' as 'hidden' | 'add' | 'pending' | 'executable' | 'check_failed',
  mutate: vi.fn(),
  isPending: false,
  noticeArgs: [] as unknown[],
}));

vi.mock('~/core/space-calls/publisher/hooks', () => ({
  useGeoPublisherNotice: (...args: unknown[]) => {
    mocks.noticeArgs = args;
    return mocks.state;
  },
  useAddGeoPublisher: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
}));

describe('GeoPublisherNotice', () => {
  afterEach(cleanup);
  beforeEach(() => {
    mocks.state = 'add';
    mocks.isPending = false;
    mocks.mutate.mockReset();
  });

  it('offers editors the add button with the notice', () => {
    render(<GeoPublisherNotice spaceId="s1" viewerIsEditor />);
    expect(screen.getByText(GEO_PUBLISHER_NOTICE_COPY.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: GEO_PUBLISHER_NOTICE_COPY.add }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it('shows the pending state instead of the button once sent', () => {
    mocks.state = 'pending';
    render(<GeoPublisherNotice spaceId="s1" viewerIsEditor />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(GEO_PUBLISHER_NOTICE_COPY.pending)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: GEO_PUBLISHER_NOTICE_COPY.governance })).toHaveAttribute(
      'href',
      '/space/s1/governance'
    );
  });

  it('points a passed proposal to Governance to execute, with no add button', () => {
    mocks.state = 'executable';
    render(<GeoPublisherNotice spaceId={'a'.repeat(32)} viewerIsEditor />);
    expect(screen.getByText(GEO_PUBLISHER_NOTICE_COPY.executable)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: GEO_PUBLISHER_NOTICE_COPY.governance })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: GEO_PUBLISHER_NOTICE_COPY.add })).toBeNull();
  });

  it('says the status could not be checked, with no add button', () => {
    mocks.state = 'check_failed';
    render(<GeoPublisherNotice spaceId={'a'.repeat(32)} viewerIsEditor />);
    expect(screen.getByText(GEO_PUBLISHER_NOTICE_COPY.checkFailed)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing to non-editors or once the grant lands', () => {
    const { container, rerender } = render(<GeoPublisherNotice spaceId="s1" viewerIsEditor={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.noticeArgs).toEqual(['s1', false]);
    mocks.state = 'hidden';
    rerender(<GeoPublisherNotice spaceId="s1" viewerIsEditor />);
    expect(container).toBeEmptyDOMElement();
  });
});
