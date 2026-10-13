import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateChallenge, DebatePerson, DebateRequest } from '~/core/debates/api';
import { DebateRequestSurface } from '~/core/debates/debate-request-surface';
import type { ClaimOpponents } from '~/core/debates/matchmaking/use-claim-opponents';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  closeSidePanel: vi.fn(),
  request: vi.fn(),
  withdraw: vi.fn(),
  cancel: vi.fn(),
  matchup: {} as {
    match: unknown;
    blockedReason?: string;
    isRequesting: boolean;
    requestError: string | null;
    switchesAvailability?: boolean;
  },
  opponents: {} as ClaimOpponents,
  activity: undefined as DebateActivity | undefined,
  outbound: null as DebateRequest | null,
  live: {
    outboundChallenge: null as DebateChallenge | null,
    blockedReason: null as string | null,
    buttonsDisabled: false,
  },
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('./use-claim-matchup', () => ({ useClaimMatchup: () => ({ ...mocks.matchup, request: mocks.request }) }));
vi.mock('~/core/debates/matchmaking/use-claim-opponents', () => ({ useClaimOpponents: () => mocks.opponents }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateActivity: () => ({ data: mocks.activity }),
  useRejectDebateChallenge: () => ({ mutate: mocks.cancel, isPending: false }),
}));
vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useDebateRequests: () => ({ data: { outbound: mocks.outbound, incoming: [] } }),
  useWithdrawDebateRequest: () => ({ mutate: mocks.withdraw, isPending: false }),
}));
vi.mock('~/core/debates/matchmaking/use-live-request-block', () => ({ useLiveRequestBlock: () => mocks.live }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ closeSidePanel: mocks.closeSidePanel }),
}));
vi.mock('~/core/debates/rematch-panel-context', () => ({ useRematchPanelContext: () => null }));
vi.mock('~/core/debates/rematch-claim-end-slot', () => ({ RematchClaimEndSlot: () => null }));
// The People tab's row, reduced to what the popup decides: who is listed, and whether they can be asked.
vi.mock('~/core/debates/matchmaking/people-tab', () => ({
  PersonRow: ({
    person,
    disabled,
    analyticsSurface,
  }: {
    person: DebatePerson;
    disabled: boolean;
    analyticsSurface: string;
  }) => (
    <li data-surface={analyticsSurface}>
      {person.display_name}
      <button type="button" disabled={disabled}>
        Debate now
      </button>
    </li>
  ),
}));
vi.mock('~/core/debates/matchmaking/use-person-facts', () => ({
  usePersonFacts: () => ({
    matchAnalysis: { byProfile: new Map(), countsByProfileAndSpace: new Map() },
    matchesKnown: true,
    matchingSpaceIds: [],
    matchingClaimNamesById: new Map(),
    matchingClaimsLoading: false,
    records: new Map(),
    debateSpacesByPerson: new Map(),
  }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({ useSpaceLabels: () => ({ labelsById: new Map() }) }));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: () => null,
}));
vi.mock('~/core/debates/matchmaking/outbound-request-card', () => ({
  OutboundRequestCard: ({ request }: { request: DebateRequest }) => <div>Outbound {request.id}</div>,
}));
vi.mock('~/core/debates/matchmaking/challenge-card', () => ({
  DebateChallengeCard: ({ challenge }: { challenge: DebateChallenge }) => <div>Challenge {challenge.id}</div>,
}));

const { ClaimEndSlot } = await import('./claim-end-slot');

const CLAIM = '11111111111111111111111111111111';
const SPACE = '22222222222222222222222222222222';

function person(name: string, overrides: Partial<DebatePerson> = {}): DebatePerson {
  return {
    user_id: `${name}-user`,
    profile_space_id: `${name}-space`,
    display_name: name,
    online: true,
    in_debate: false,
    away: false,
    can_challenge: true,
    ...overrides,
  } as DebatePerson;
}

function opponents(overrides: Partial<ClaimOpponents> = {}): ClaimOpponents {
  const online = overrides.online ?? [];
  return {
    status: 'ready',
    online,
    askableCount: online.filter(p => p.online && !p.away && !p.in_debate).length,
    withFreeTime: new Set(),
    slotsByUser: new Map(),
    ...overrides,
  };
}

function outboundRequest(id = 'request-1'): DebateRequest {
  return {
    id,
    status: 'pending',
    claim: { claim_entity_id: CLAIM, space_id: SPACE, claim: 'Cats are better' },
    requester: { user_id: 'viewer-user', display_name: 'Me' },
    recipient: { user_id: 'dis-user', display_name: 'Dis' },
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as DebateRequest;
}

function View({
  activeDebate,
  surface = 'claim_page',
}: {
  activeDebate?: boolean;
  surface?: 'claim_page' | 'claim_side_panel';
}) {
  return (
    <DebateRequestSurface surface={surface}>
      <ClaimEndSlot
        claimId={CLAIM}
        spaceId={SPACE}
        claimName="Cats are better"
        viewerPosition
        variant="block"
        activeDebate={activeDebate}
      />
    </DebateRequestSurface>
  );
}

const opportunityEvents = () => mocks.capture.mock.calls.filter(([name]) => name === 'action_opportunity');

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.closeSidePanel.mockReset();
  mocks.request.mockReset();
  mocks.matchup = { match: null, blockedReason: undefined, isRequesting: false, requestError: null };
  mocks.opponents = opponents();
  mocks.activity = undefined;
  mocks.outbound = null;
  mocks.live = { outboundChallenge: null, blockedReason: null, buttonsDisabled: false };
});
afterEach(cleanup);

describe('the claim page Request debate', () => {
  it('shows nothing when nobody on the other side is online or free', () => {
    const { container } = render(<View />);
    expect(container).toBeEmptyDOMElement();
    expect(opportunityEvents()).toHaveLength(0);
  });

  it('is filled when someone on the other side can be asked now, and reports it as a live opportunity', () => {
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    const button = screen.getByRole('button', { name: 'Request debate' });
    expect(button).toHaveAttribute('data-geo-analytics-label', 'Claim Request debate');
    expect(opportunityEvents()).toEqual([
      [
        'action_opportunity',
        expect.objectContaining({
          action_kind: 'start_debate',
          target_type: 'claim',
          target_id: CLAIM,
          eligibility: 'eligible',
          eligibility_reason: 'live',
          request_surface: 'claim_page',
        }),
      ],
    ]);
  });

  it('is filled for a live match even before the graph lists anyone', () => {
    mocks.matchup = { ...mocks.matchup, match: { claim: {}, viewer_position: true } };
    render(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeInTheDocument();
  });

  it('ranks Watch live above the outlined look', () => {
    mocks.opponents = opponents({ withFreeTime: new Set(['later']) });
    render(<View activeDebate />);
    expect(screen.getByRole('link', { name: /Watch live/ })).toBeInTheDocument();
    expect(screen.queryByText('Request debate')).toBeNull();
  });

  it('is an outlined link to the calendar, filtered to this claim, when someone has free time', () => {
    mocks.opponents = opponents({ withFreeTime: new Set(['later']) });
    render(<View />);
    const link = screen.getByRole('link', { name: 'Request debate' });
    const url = new URL(link.getAttribute('href')!, 'https://geo.test');
    expect(url.pathname).toBe('/matchmaking/calendar');
    expect(url.searchParams.get('claims')).toBe(`${SPACE}:${CLAIM}`);
    expect(url.searchParams.get('matches')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('claim_page');
    const opportunity = opportunityEvents()[0]?.[1];
    expect(opportunity).toMatchObject({ eligibility_reason: 'scheduled' });
    expect(url.searchParams.get('opportunity')).toBe(opportunity.opportunity_id);
  });

  it('closes the side panel on its way to the calendar', () => {
    mocks.opponents = opponents({ withFreeTime: new Set(['later']) });
    render(<View surface="claim_side_panel" />);
    const link = screen.getByRole('link', { name: 'Request debate' });
    expect(new URL(link.getAttribute('href')!, 'https://geo.test').searchParams.get('origin')).toBe('claim_side_panel');
    fireEvent.click(link);
    expect(mocks.closeSidePanel).toHaveBeenCalled();
  });

  it('keeps a status line with Withdraw while a request on this claim is out', () => {
    mocks.outbound = outboundRequest();
    render(<View />);
    expect(screen.getByText('Request sent')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(mocks.withdraw).toHaveBeenCalledWith('request-1');
  });

  it("does not claim another claim's request", () => {
    mocks.outbound = { ...outboundRequest(), claim: { claim_entity_id: 'other', space_id: SPACE } } as DebateRequest;
    const { container } = render(<View />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the debate popup', () => {
  function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    return screen.getByRole('dialog');
  }

  it('offers First available, the people online and scheduling on one screen', () => {
    mocks.opponents = opponents({ online: [person('dis'), person('dat')], withFreeTime: new Set(['later']) });
    render(<View />);
    const dialog = open();
    expect(within(dialog).getByText('Debate this claim')).toBeInTheDocument();
    expect(within(dialog).getByText('2 people who disagree are online')).toBeInTheDocument();
    expect(within(dialog).getByText('First available')).toBeInTheDocument();
    expect(within(dialog).getByText('dis')).toBeInTheDocument();
    expect(within(dialog).getByText('dat')).toBeInTheDocument();
    expect(within(dialog).getByText('1 person who disagrees has free time')).toBeInTheDocument();
    const later = within(dialog).getByRole('link', { name: /Schedule for later/ });
    expect(later).toHaveAttribute('data-geo-analytics-label', 'Claim Schedule later');
    expect(within(dialog).queryByRole('button', { name: '‹ Back' })).toBeNull();
  });

  it('leaves scheduling out when nobody on the other side has free time', () => {
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    const dialog = open();
    expect(within(dialog).getByText('First available')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Schedule for later/ })).toBeNull();
  });

  it('says First available will switch an unavailable viewer on', () => {
    mocks.matchup = { ...mocks.matchup, match: { claim: {}, viewer_position: true }, switchesAvailability: true };
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    const dialog = open();
    expect(within(dialog).getByText('You’ll show as available to debate.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Request debate' })).toBeEnabled();
  });

  it('holds First available back without a live match, but still lists people to ask', () => {
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    const dialog = open();
    expect(within(dialog).getByText('Nobody on the other side is ready on this claim right now.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Request debate' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Debate now' })).toBeEnabled();
    expect(within(dialog).getByText('dis').closest('li')).toHaveAttribute('data-surface', 'claim-popup');
  });

  it('sends First available as the claim request', () => {
    mocks.matchup = { ...mocks.matchup, match: { claim: {}, viewer_position: true } };
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    const button = within(open()).getByRole('button', { name: 'Request debate' });
    expect(button).toHaveAttribute('data-geo-analytics-label', 'Claim First available');
    fireEvent.click(button);
    expect(mocks.request).toHaveBeenCalled();
  });

  it('holds the live options back while a request is out, and leaves scheduling open', () => {
    mocks.matchup = {
      ...mocks.matchup,
      match: { claim: {}, viewer_position: true },
      blockedReason: 'Withdraw your open request to send another.',
    };
    mocks.live = { outboundChallenge: null, blockedReason: 'You already have an open request.', buttonsDisabled: true };
    mocks.opponents = opponents({ online: [person('dis')], withFreeTime: new Set(['later']) });
    render(<View />);
    const now = open();
    expect(within(now).getByRole('link', { name: /Schedule for later/ })).toBeInTheDocument();
    expect(within(now).getByText('Withdraw your open request to send another.')).toBeInTheDocument();
    expect(within(now).getByRole('button', { name: 'Request debate' })).toBeDisabled();
    expect(within(now).getByRole('button', { name: 'Debate now' })).toBeDisabled();
    expect(within(now).getByText('You already have an open request. Scheduling still works.')).toBeInTheDocument();
  });

  it('says so when everyone on the other side has left', () => {
    mocks.matchup = { ...mocks.matchup, match: { claim: {}, viewer_position: true } };
    render(<View />);
    expect(within(open()).getByText('Nobody else on the other side is online right now.')).toBeInTheDocument();
  });

  it('shows the request once sent, and says when it ends without a debate', () => {
    mocks.matchup = { ...mocks.matchup, match: { claim: {}, viewer_position: true } };
    mocks.opponents = opponents({ online: [person('dis')], withFreeTime: new Set(['later']) });
    const view = render(<View />);
    open();

    mocks.outbound = outboundRequest();
    view.rerender(<View />);
    const sent = screen.getByRole('dialog');
    expect(within(sent).getByText('Outbound request-1')).toBeInTheDocument();
    expect(
      within(sent).getByText("If Dis passes, we'll try the next person on the other side until it expires.")
    ).toBeInTheDocument();
    // The claim keeps saying so under the button.
    expect(screen.getByText('Request sent', { selector: 'span' })).toBeInTheDocument();

    mocks.outbound = null;
    act(() => view.rerender(<View />));
    const ended = screen.getByRole('dialog');
    expect(within(ended).getByText('No one took it this time')).toBeInTheDocument();
    expect(within(ended).getByRole('link', { name: 'Schedule for later' })).toBeInTheDocument();
  });

  it('shows an invite sent to one person, and keeps it under the claim after closing', () => {
    mocks.opponents = opponents({ online: [person('dis')] });
    const view = render(<View />);
    open();
    mocks.live = {
      outboundChallenge: {
        id: 'challenge-1',
        status: 'pending',
        requester: { user_id: 'viewer-user' },
        recipient: { user_id: 'dis-user', display_name: 'Dis' },
      } as unknown as DebateChallenge,
      blockedReason: null,
      buttonsDisabled: true,
    };
    view.rerender(<View />);
    const sent = screen.getByRole('dialog');
    expect(within(sent).getByText('Challenge challenge-1')).toBeInTheDocument();
    expect(within(sent).getByText('Dis picks the claim when they accept.')).toBeInTheDocument();
    fireEvent.click(within(sent).getByRole('button', { name: 'Keep browsing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Invite sent')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(mocks.cancel).toHaveBeenCalledWith('challenge-1');
  });

  it('closes on Escape', () => {
    mocks.opponents = opponents({ online: [person('dis')] });
    render(<View />);
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
