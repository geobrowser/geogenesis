import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import type { DebateLobbyMember, DebateLobbyPairPerson } from '../api';
import { LobbyDebatePairs } from './lobby-debate-pairs';

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
    expect(cards[0]!.textContent).toBe('Ana vs. BenIn a debate on “Cats are better”');
    expect(cards[1]!.textContent).toBe('CyIn a debate');
  });

  it('draws nothing when nobody is debating', () => {
    const { container } = render(<LobbyDebatePairs pairs={[]} members={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
