import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyCallDetails } from '~/core/debates/api';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';

const mocks = vi.hoisted(() => ({ remind: [] as unknown[], flag: true }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/space-calls/series/hooks', () => ({ useSaveCallAgenda: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('./call-remind', () => ({
  CallRemind: (props: unknown) => {
    mocks.remind.push(props);
    return <button type="button">Remind me</button>;
  },
}));

const { CallPreOpen } = await import('./call-pre-open');

afterEach(() => {
  cleanup();
  mocks.remind = [];
  mocks.flag = true;
});

const series = {
  series_id: 'series1',
  name: 'Crypto Community Call',
  description: 'Open discussion',
  schedule: 'DTSTART:20261104T160000Z',
  one_off: false,
};

function lobby(call: Partial<DebateLobbyCallDetails>, reminded = false): LobbyPageView {
  return {
    lobby_id: 'call1',
    name: 'Crypto Community Call',
    purpose: 'call',
    access: { status: 'not_yet_open', opens_at: '2026-11-04T15:50:00Z' },
    starts_at: '2026-11-04T16:00:00Z',
    opens_at: '2026-11-04T15:50:00Z',
    scheduled: true,
    viewer: { reminded },
    call: { space_id: 'space1', space_name: 'Crypto', started_by: null, status: 'scheduled', ...call },
  } as unknown as LobbyPageView;
}

describe('CallPreOpen', () => {
  it('shows the time, the series default agenda read-only, and both reminders', () => {
    render(
      <CallPreOpen
        lobby={lobby({
          ends_at: '2026-11-04T17:00:00Z',
          series,
          agenda: null,
          viewer: { can_edit_agenda: false, reminded: false, series_reminded: true },
        })}
      />
    );
    expect(screen.getByTestId('pre-call-when').querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-11-04T16:00:00Z'
    );
    expect(screen.getByText('Open discussion')).toBeInTheDocument();
    expect(screen.getByText('From the series description.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agenda/i })).not.toBeInTheDocument();
    expect(mocks.remind[0]).toMatchObject({
      spaceId: 'space1',
      callId: 'call1',
      seriesId: 'series1',
      call: false,
      series: true,
    });
    expect(screen.getByRole('link', { name: '← Back to Crypto' })).toHaveAttribute('href', '/space/space1/calls');
  });

  it('lets a host edit a written agenda', () => {
    render(
      <CallPreOpen
        lobby={lobby({
          series,
          agenda: { body: 'Intros', updated_at: '2026-10-27T09:12:44Z', updated_by: null },
          viewer: { can_edit_agenda: true, reminded: true, series_reminded: false },
        })}
      />
    );
    expect(screen.getByText('Intros')).toBeInTheDocument();
    expect(screen.queryByText('From the series description.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit agenda' })).toBeInTheDocument();
  });

  it('reads a signed-out guest view, and gives a one-off no series reminder', () => {
    render(<CallPreOpen lobby={lobby({ series: { ...series, one_off: true }, agenda: null, viewer: null })} />);
    expect(mocks.remind[0]).toMatchObject({ seriesId: null, call: false, series: false });
  });
});
