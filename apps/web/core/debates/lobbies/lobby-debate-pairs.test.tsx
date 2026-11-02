import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyPairPerson } from '../api';
import { LobbyDebatePairs } from './lobby-debate-pairs';
import type { LobbyPageView } from './lobby-view';

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => true }));
vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({ useOpenDebaterProfile: () => vi.fn() }));
vi.mock('./lobby-schedule', () => ({
  LobbyScheduleSection: ({ member }: { member: DebateLobbyMember }) => <div>Schedule {member.user_id}</div>,
}));

afterEach(cleanup);

function person(id: string, inLobby = true): DebateLobbyPairPerson {
  return { user_id: id, profile_space_id: `space-${id}`, display_name: id, avatar_cid: null, in_lobby: inLobby };
}

function member(id: string): DebateLobbyMember {
  return {
    ...person(id),
    role: 'speaker',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-09T10:00:00Z',
    stepped_out: false,
    in_debate: true,
    in_debate_subject: { phase: 'on_claim', claim_entity_id: 'c', claim_name: 'Cats are better', space_id: 's' },
  };
}

describe('LobbyDebatePairs', () => {
  it('draws a card per pair, with an outside partner and a hidden one', () => {
    render(
      <Provider store={createStore()}>
        <LobbyDebatePairs
          pairs={[{ people: [person('Ana'), person('Ben', false)] }, { people: [person('Cy')] }]}
          members={[member('Ana'), { ...member('Cy'), in_debate_subject: null }]}
        />
      </Provider>
    );

    const cards = screen.getAllByTestId('lobby-debate-pair');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toBe('Ana vs. BenCats are better');
    expect(cards[1]!.textContent).toBe('Cy');
  });

  it('adds the round and a Recording pill when geo-chat sends progress', () => {
    render(
      <Provider store={createStore()}>
        <LobbyDebatePairs
          pairs={[
            { people: [person('Ana'), person('Ben')], progress: { round: 2, rounds: 3, recording: true } },
            { people: [person('Cy')], progress: { round: 1, rounds: null, recording: false } },
            { people: [person('Di')], progress: { round: null, rounds: 3, recording: false } },
          ]}
          members={[
            member('Ana'),
            { ...member('Cy'), in_debate_subject: null },
            { ...member('Di'), in_debate_subject: null },
          ]}
        />
      </Provider>
    );

    const cards = screen.getAllByTestId('lobby-debate-pair');
    expect(cards[0]!.textContent).toBe('Ana vs. BenCats are better · round 2 of 3Recording');
    expect(cards[1]!.textContent).toBe('Cyround 1');
    expect(cards[2]!.textContent).toBe('Di');
  });

  it.each(['Ana', 'Ben'])('opens %s’s own menu from a pair, including a partner outside the roster', name => {
    const view = {
      lobby_id: 'lobby',
      members: [member('Ana')],
      viewer: { kind: 'member', role: 'speaker', hosting: false, creator: false },
    } as LobbyPageView;
    render(
      <LobbyDebatePairs
        pairs={[{ people: [person('Ana'), person('Ben', false)] }]}
        members={view.members}
        lobby={view}
        viewerId="me"
      />
    );
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByTestId('lobby-person-card')).toHaveTextContent(`${name} is in a debate`);
    expect(screen.getByText(`Schedule ${name}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Request a debate/ })).toBeNull();
  });

  it('never offers host controls or counts their opening for a partner outside the lobby', () => {
    const view = {
      lobby_id: 'lobby',
      members: [member('Ana')],
      viewer: { kind: 'member', role: 'host', hosting: true, creator: true },
    } as LobbyPageView;
    render(
      <LobbyDebatePairs
        pairs={[{ people: [person('Ana'), person('Ben', false)] }]}
        members={view.members}
        lobby={view}
        viewerId="me"
      />
    );
    const ben = screen.getByRole('button', { name: 'Ben' });
    expect(ben).not.toHaveAttribute('data-geo-analytics-intent', 'open_lobby_host_controls');
    fireEvent.click(ben);
    expect(screen.queryByText('Host controls')).toBeNull();
    expect(screen.getByText('Schedule Ben')).toBeInTheDocument();
  });

  it('draws nothing when nobody is debating', () => {
    const { container } = render(<LobbyDebatePairs pairs={[]} members={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
