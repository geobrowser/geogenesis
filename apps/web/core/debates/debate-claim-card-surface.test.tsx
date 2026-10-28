import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ActionScope, snapshotActionContext } from '~/core/action-context';
import { ActionContextProvider, useActionContext } from '~/core/action-context-provider';
import { runObservedAction } from '~/core/analytics-operations';

import {
  DebateClaimCardSurface,
  DrawnHubListProvider,
  sectionStartOffsets,
  useDrawnHubList,
  useRecordClaimFilter,
  useRecordedSpaceTopicFilters,
  useReportDrawnHubList,
} from './debate-claim-card-surface';

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
      debated_since_listing: 2,
      list_searched: true,
      rematch_session_id: 'session',
      filter_selected: true,
    });
    expect(context).toMatchObject({
      list_entity_id: 'page',
      list_section_id: 'topic',
      agenda_id: 'agenda',
      agenda_date: '2026-10-27',
      debated_since_listing: 2,
      list_searched: true,
      rematch_session_id: 'session',
      filter_selected: true,
    });
  });

  it('drops a debated count that is not a number', () => {
    const scope = { list_id: 'todays_claims', debated_since_listing: 'twice' } as unknown as ActionScope;
    expect(snapshotActionContext('debate_claim_card', 'claim', 'claim', scope)).not.toHaveProperty(
      'debated_since_listing'
    );
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

  it('keeps the action and its success when reading the outcome throws', async () => {
    const result = await runObservedAction(
      'start_debate',
      snapshotActionContext('debate_matchmaking', 'claim', 'claim'),
      async () => ({ request: null as { id: string } | null }),
      undefined,
      created => ({ request_id: created.request!.id })
    );
    expect(result).toEqual({ request: null });
    expect(completions()).toEqual([expect.objectContaining({ action_kind: 'start_debate', outcome: 'succeeded' })]);
    expect(completions()[0]).not.toHaveProperty('request_id');
  });

  it('hands the list its card node, which popLayout measures to pop a leaving card out', () => {
    const ref = React.createRef<HTMLElement>();
    function Card({ ref }: { ref?: React.Ref<HTMLElement> }) {
      return <article ref={ref}>card</article>;
    }
    const { container } = render(
      <DebateClaimCardSurface ref={ref} claimId="claim" listId="hub_matches" position={1}>
        <Card />
      </DebateClaimCardSurface>
    );
    expect(ref.current).toBe(container.querySelector('article'));
  });

  // The side panel and full screen can both be open on /matchmaking: each keeps its own list on screen.
  it('keeps each hub host’s list on screen to itself', () => {
    const seen: Record<string, unknown> = {};
    function List({ id }: { id: 'hub_matches' | 'hub_explore' }) {
      useReportDrawnHubList(id);
      return null;
    }
    function Host({ name, id }: { name: string; id: 'hub_matches' | 'hub_explore' }) {
      const drawn = useDrawnHubList();
      seen[name] = useAtomValue(drawn);
      return (
        <DrawnHubListProvider value={drawn}>
          <List id={id} />
        </DrawnHubListProvider>
      );
    }
    render(
      <>
        <Host name="panel" id="hub_matches" />
        <Host name="workspace" id="hub_explore" />
        {/* Outside a hub host, a list has nowhere to say it. */}
        <List id="hub_matches" />
      </>
    );

    expect(seen).toEqual({ panel: 'hub_matches', workspace: 'hub_explore' });
  });

  it('numbers sections on from where the one before ended', () => {
    expect(sectionStartOffsets([2, 0, 3, 1])).toEqual([0, 2, 2, 5]);
    expect(sectionStartOffsets([])).toEqual([]);
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
        target_id: 'topic1',
        filter_selected: true,
        list_id: 'rematch_explore',
        rematch_session_id: 'session',
      }),
      expect.objectContaining({ target_type: 'tab', target_id: 'rematch_matches', list_id: 'rematch_explore' }),
    ]);
    expect(completions()[1]).not.toHaveProperty('filter_selected');
  });

  // A space id reaches the menu in either spelling (see `toggleId`): unticking one picked in the
  // other is still an untick, and both name the space the same way.
  it('records a space press under one spelling, whichever the menu row carried', () => {
    const onSpaceToggle = vi.fn();
    function Filters() {
      const filters = useRecordedSpaceTopicFilters('hub_matches', {
        spaceIds: ['3f2a1b4c-0d5e-4f6a-8b7c-9d0e1f2a3b4c'],
        onSpaceToggle,
        onSpacesClear: vi.fn(),
        topicIds: [],
        setTopicIds: vi.fn(),
      });
      return <button onClick={() => filters.onSpaceToggle('3F2A1B4C0D5E4F6A8B7C9D0E1F2A3B4C')}>Space</button>;
    }
    render(<Filters />);
    fireEvent.click(screen.getByRole('button', { name: 'Space' }));
    expect(completions()).toEqual([
      expect.objectContaining({
        target_type: 'space',
        target_id: '3f2a1b4c0d5e4f6a8b7c9d0e1f2a3b4c',
        filter_selected: false,
      }),
    ]);
  });

  it("records a hub list's space and topic presses, then applies them", () => {
    const onSpaceToggle = vi.fn();
    const onSpacesClear = vi.fn();
    const setTopicIds = vi.fn();
    function Filters() {
      const filters = useRecordedSpaceTopicFilters('hub_matches', {
        spaceIds: ['space-1'],
        onSpaceToggle,
        onSpacesClear,
        topicIds: [],
        setTopicIds,
      });
      return (
        <>
          <button onClick={() => filters.onSpaceToggle('space-1')}>Space</button>
          <button onClick={() => filters.onTopicToggle('topic-1')}>Topic</button>
          <button onClick={filters.onTopicsClear}>Clear topics</button>
        </>
      );
    }
    render(<Filters />);
    for (const name of ['Space', 'Topic', 'Clear topics']) fireEvent.click(screen.getByRole('button', { name }));
    expect(completions()).toEqual([
      expect.objectContaining({
        target_type: 'space',
        target_id: 'space1',
        filter_selected: false,
        list_id: 'hub_matches',
      }),
      expect.objectContaining({
        target_type: 'topic',
        target_id: 'topic1',
        filter_selected: true,
        list_id: 'hub_matches',
      }),
      expect.objectContaining({
        target_type: 'topic',
        target_id: 'all',
        filter_selected: false,
        list_id: 'hub_matches',
      }),
    ]);
    expect(onSpaceToggle).toHaveBeenCalledWith('space-1');
    expect(onSpacesClear).not.toHaveBeenCalled();
    expect(setTopicIds.mock.calls[0][0]([])).toEqual(['topic-1']);
    expect(setTopicIds).toHaveBeenLastCalledWith([]);
  });
});
