import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import type { DebateLobbyMember } from '../api';
import { LobbyDebateSubject } from './lobby-debate-subject';
import { entitySidePanelAtom } from '~/atoms';

afterEach(cleanup);

function renderSubject(subject: DebateLobbyMember['in_debate_subject']) {
  const store = createStore();
  const view = render(
    <Provider store={store}>
      <p data-testid="line">
        <LobbyDebateSubject subject={subject} />
      </p>
    </Provider>
  );
  return { store, ...view };
}

describe('LobbyDebateSubject', () => {
  it('opens the claim in the entity side panel rather than navigating away from the lobby', () => {
    const { store } = renderSubject({
      phase: 'on_claim',
      claim_entity_id: 'claim-1',
      claim_name: 'Cats are better',
      space_id: 'space-1',
    });

    expect(screen.getByTestId('line').textContent).toBe('In a debate on “Cats are better”');
    expect(screen.queryByRole('link')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cats are better' }));

    expect(store.get(entitySidePanelAtom)).toMatchObject({ entityId: 'claim-1', spaceId: 'space-1' });
  });

  it.each([
    ['picking a claim', { phase: 'choosing_claim' } as const, 'In a debate, picking a claim'],
    ['no subject', null, 'In a debate'],
    [
      'a claim with no name',
      { phase: 'on_claim', claim_entity_id: 'c', claim_name: ' ', space_id: 's' } as const,
      'In a debate',
    ],
  ])('shows plain text for %s', (_label, subject, text) => {
    renderSubject(subject);

    expect(screen.getByTestId('line').textContent).toBe(text);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
