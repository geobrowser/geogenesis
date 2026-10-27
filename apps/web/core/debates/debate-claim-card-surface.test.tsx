import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext } from '~/core/action-context';
import { ActionContextProvider, useActionContext } from '~/core/action-context-provider';
import { runObservedAction } from '~/core/analytics-operations';

import { DebateClaimCardSurface, useRecordClaimFilter } from './debate-claim-card-surface';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));

const observers = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  window.history.replaceState({}, '', '/debates/rematches/session');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe = (element: Element) => observers.set(element, this.callback);
      disconnect() {}
    }
  );
});
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
  capture.mockReset();
});

const completions = () =>
  capture.mock.calls.filter(([event]) => event === 'action_completed').map(([, props]) => props);

describe('GEO-3495 claim attribution', () => {
  it('keeps the new list and agenda fields through the allowlist', () => {
    const context = snapshotActionContext('debate_claim_card', 'claim', 'claim', {
      list_id: 'todays_claims',
      list_entity_id: 'page',
      list_section_id: 'topic',
      agenda_id: 'agenda',
      agenda_date: '2026-10-27',
      list_searched: true,
      rematch_session_id: 'session',
      filter_selected: true,
    });
    expect(context).toMatchObject({
      list_entity_id: 'page',
      list_section_id: 'topic',
      agenda_id: 'agenda',
      agenda_date: '2026-10-27',
      list_searched: true,
      rematch_session_id: 'session',
      filter_selected: true,
    });
  });

  it('puts the created request id on the completion', async () => {
    await runObservedAction(
      'start_debate',
      snapshotActionContext('debate_matchmaking', 'claim', 'claim'),
      async () => ({ id: 'request-1', text: 'never sent' }),
      undefined,
      created => ({ request_id: created.id, text: created.text })
    );
    expect(completions()).toEqual([expect.objectContaining({ action_kind: 'start_debate', request_id: 'request-1' })]);
    expect(completions()[0]).not.toHaveProperty('text');
  });

  it('records a card impression and a request from it with its list and place', () => {
    function RequestButton() {
      const getContext = useActionContext('debate_matchmaking', 'entity', '');
      return (
        <button
          onClick={() =>
            void runObservedAction(
              'start_debate',
              getContext({ target_type: 'claim', target_id: 'claim-b' }),
              async () => ({
                id: 'request-2',
              })
            )
          }
        >
          Request debate
        </button>
      );
    }
    const { container } = render(
      <ActionContextProvider value={{ lobby_id: 'lobby' }}>
        {['claim-a', 'claim-b'].map((claimId, index) => (
          <DebateClaimCardSurface
            key={claimId}
            claimId={claimId}
            listId="lobby_list"
            position={index + 1}
            scope={{ list_entity_id: 'page' }}
          >
            <article>{claimId === 'claim-b' ? <RequestButton /> : claimId}</article>
          </DebateClaimCardSurface>
        ))}
      </ActionContextProvider>
    );
    const articles = [...container.querySelectorAll('article')];
    expect([...observers.keys()]).toEqual(articles);
    act(() =>
      observers.get(articles[1])!(
        [{ target: articles[1], isIntersecting: true, intersectionRatio: 1 } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(capture).toHaveBeenCalledWith(
      'component_impression',
      expect.objectContaining({
        component: 'debate_claim_card',
        target_type: 'claim',
        target_id: 'claim-b',
        list_id: 'lobby_list',
        list_entity_id: 'page',
        item_position: 2,
        lobby_id: 'lobby',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    return vi.waitFor(() =>
      expect(completions()).toEqual([
        expect.objectContaining({
          component: 'debate_claim_card',
          target_id: 'claim-b',
          list_id: 'lobby_list',
          item_position: 2,
          lobby_id: 'lobby',
        }),
      ])
    );
  });

  it('records the space or topic a filter press chose', () => {
    function Filters() {
      const record = useRecordClaimFilter('debate_matchmaking', { rematch_session_id: 'session' });
      return (
        <>
          <button onClick={() => record('rematch_explore', { kind: 'topic', value: 'topic-1', selected: true })}>
            Topic
          </button>
          <button onClick={() => record('rematch_explore', { kind: 'tab', value: 'rematch_matches' })}>Matches</button>
        </>
      );
    }
    render(<Filters />);
    fireEvent.click(screen.getByRole('button', { name: 'Topic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matches' }));
    expect(completions()).toEqual([
      expect.objectContaining({
        action_kind: 'filter_claims',
        component: 'debate_matchmaking',
        target_type: 'topic',
        target_id: 'topic-1',
        filter_selected: true,
        list_id: 'rematch_explore',
        rematch_session_id: 'session',
      }),
      expect.objectContaining({ target_type: 'tab', target_id: 'rematch_matches', list_id: 'rematch_explore' }),
    ]);
    expect(completions()[1]).not.toHaveProperty('filter_selected');
  });
});
