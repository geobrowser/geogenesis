'use client';

import * as React from 'react';

import type { ActionComponent, ActionScope } from '~/core/action-context';
import { ActionSurface, useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';

import { toggleId } from './matchmaking/topic-facets';

/**
 * GEO-3495. Where a claim card was shown when someone picked a claim to debate. Ids of lists, never
 * their text: a lobby's curated list adds its page as `list_entity_id`.
 *
 * Today's claims has one id per surface, reserved here so the lists that build it use these rather
 * than improvising. A distinct id rather than `todays_claims` plus a surface property, so every
 * report that groups by `list_id` tells the surfaces apart with no change:
 *   todays_claims                 the in-room picker's tab (GEO-3489)
 *   todays_claims_hub             the section in the debates side panel and full-screen hub (GEO-3490)
 *   todays_claims_lobby           a lobby's "Today's claims" tab (GEO-3491)
 *   todays_claims_callout         the daily callout in the side panel and hub (GEO-3498)
 *   todays_claims_explore_banner  the Explore banner (GEO-3502)
 * Each also sets `agenda_id`, `agenda_date`, `list_section_id` (the agenda's data block) and
 * `debated_since_listing`.
 */
export type DebateClaimListId =
  | 'rematch_matches'
  | 'rematch_from_this_debate'
  | 'rematch_related'
  | 'rematch_their_positions'
  | 'rematch_my_positions'
  | 'rematch_explore'
  | 'hub_lobby'
  | 'hub_matches'
  | 'hub_explore'
  | 'hub_my_positions'
  | 'lobby_room_claims'
  | 'lobby_highlighted'
  | 'lobby_room_vote'
  | 'lobby_list'
  | 'lobby_explore'
  | 'todays_claims'
  | 'todays_claims_hub'
  | 'todays_claims_lobby'
  | 'todays_claims_callout'
  | 'todays_claims_explore_banner';

/** GEO-3495. The hub tabs that are claim lists, by the list they show. Lobby is its wider list. */
export const HUB_TAB_LIST_IDS: Partial<Record<string, DebateClaimListId>> = {
  lobby: 'hub_lobby',
  explore: 'hub_explore',
  positions: 'hub_my_positions',
};

/**
 * GEO-3495. Where each section of a list starts in its 1-based numbering, as offsets: section `i`'s
 * first card is `offsets[i] + 1`, so positions run on across sections.
 */
export function sectionStartOffsets(counts: readonly number[]): number[] {
  let total = 0;
  return counts.map(count => {
    const start = total;
    total += count;
    return start;
  });
}

/**
 * A claim card in a debate picker, side panel or lobby list (GEO-3495): records its impression with
 * the list and 1-based position, and attributes a debate requested from inside it to the same.
 * `display: contents`, so the card keeps its own place in the list's layout.
 *
 * It sits between `HubCardList` and the card, so it hands the list's `ref` on to the card: the
 * list's popLayout measures that node to pop a leaving card out of flow, and this wrapper has no box
 * of its own to measure.
 */
export function DebateClaimCardSurface({
  claimId,
  listId,
  position,
  scope,
  children,
  ref,
}: {
  claimId: string;
  listId: DebateClaimListId;
  position: number;
  /** More attribution: the list's entity, its section, its agenda, whether it was searched. */
  scope?: Omit<ActionScope, 'component' | 'target_id' | 'target_type' | 'list_id' | 'item_position'>;
  children: React.ReactElement<{ ref?: React.Ref<HTMLElement> }>;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <ActionSurface
      className="contents"
      value={{
        ...scope,
        component: 'debate_claim_card',
        target_type: 'claim',
        target_id: claimId,
        list_id: listId,
        item_position: position,
      }}
    >
      {ref ? React.cloneElement(children, { ref }) : children}
    </ActionSurface>
  );
}

/**
 * What a filter choice names (GEO-3495): a tab by its list id, a space or topic by its entity id, the
 * claims source by its token. `filters` / `all` is clearing every filter at once. `section` is a
 * Today's claims agenda section collapsed or expanded from its heading, by its data block id;
 * `selected` is true when it opened (reserved for GEO-3489).
 */
export type ClaimFilterChoice =
  | { kind: 'tab'; value: DebateClaimListId }
  | { kind: 'space' | 'topic' | 'section'; value: string; selected: boolean }
  | { kind: 'claims_source'; value: 'recommended' | 'all' | 'mine' }
  | { kind: 'filters'; value: 'all' };

/**
 * Records the viewer's own tab, space, topic and source choices on a claim list as `filter_claims`
 * (GEO-3495), so a list's use can be read by what was chosen rather than only that a pill was
 * pressed. Call it from the press, never from a default being applied. Never the search text.
 */
export function useRecordClaimFilter(component: ActionComponent, scope: ActionScope = {}) {
  const getContext = useActionContext(component, 'filter', '', scope);
  return React.useCallback(
    (listId: DebateClaimListId, choice: ClaimFilterChoice) => {
      try {
        recordAction(
          'filter_claims',
          getContext({
            target_type: choice.kind,
            target_id: choice.value,
            list_id: listId,
            ...('selected' in choice ? { filter_selected: choice.selected } : {}),
          })
        );
      } catch {
        /* Optional telemetry. */
      }
    },
    [getContext]
  );
}

/**
 * A hub list's space and topic filter handlers, each recording the viewer's choice (GEO-3495) before
 * applying it: for `HubFacetRail` and `SpaceTopicFilters`. A per-kind clear records `all`.
 */
export function useRecordedSpaceTopicFilters(
  listId: DebateClaimListId,
  filters: {
    spaceIds: readonly string[];
    onSpaceToggle: (id: string) => void;
    onSpacesClear: () => void;
    topicIds: readonly string[];
    setTopicIds: (next: string[] | ((current: string[]) => string[])) => void;
  }
) {
  const recordFilter = useRecordClaimFilter('debate_matchmaking');
  const { spaceIds, onSpaceToggle, onSpacesClear, topicIds, setTopicIds } = filters;
  return {
    recordFilter: (choice: ClaimFilterChoice) => recordFilter(listId, choice),
    onSpaceToggle: (id: string) => {
      recordFilter(listId, { kind: 'space', value: id, selected: !spaceIds.includes(id) });
      onSpaceToggle(id);
    },
    onSpacesClear: () => {
      recordFilter(listId, { kind: 'space', value: 'all', selected: false });
      onSpacesClear();
    },
    onTopicToggle: (id: string) => {
      recordFilter(listId, { kind: 'topic', value: id, selected: !topicIds.includes(id) });
      setTopicIds(current => toggleId(current, id));
    },
    onTopicsClear: () => {
      recordFilter(listId, { kind: 'topic', value: 'all', selected: false });
      setTopicIds([]);
    },
  };
}
