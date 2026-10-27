'use client';

import * as React from 'react';

import type { ActionComponent, ActionScope } from '~/core/action-context';
import { ActionSurface, useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';

/**
 * GEO-3495. Where a claim card was shown when someone picked a claim to debate. Ids of lists, never
 * their text: a lobby's curated list adds its page as `list_entity_id`.
 *
 * `todays_claims` is reserved for the Today's claims lists (GEO-3489, GEO-3490, GEO-3491).
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
  | 'todays_claims';

/** GEO-3495. The hub tabs that are claim lists, by the list they show. Lobby is its wider list. */
export const HUB_TAB_LIST_IDS: Partial<Record<string, DebateClaimListId>> = {
  lobby: 'hub_lobby',
  explore: 'hub_explore',
  positions: 'hub_my_positions',
};

/**
 * A claim card in a debate picker, side panel or lobby list (GEO-3495): records its impression with
 * the list and 1-based position, and attributes a debate requested from inside it to the same.
 * `display: contents`, so the card keeps its own place in the list's layout.
 */
export function DebateClaimCardSurface({
  claimId,
  listId,
  position,
  scope,
  children,
}: {
  claimId: string;
  listId: DebateClaimListId;
  position: number;
  /** More attribution: the list's entity, its section, its agenda, whether it was searched. */
  scope?: Omit<ActionScope, 'component' | 'target_id' | 'target_type' | 'list_id' | 'item_position'>;
  children: React.ReactNode;
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
      {children}
    </ActionSurface>
  );
}

/**
 * What a filter choice names (GEO-3495): a tab by its list id, a space or topic by its entity id, the
 * claims source by its token. `filters` / `all` is clearing every filter at once.
 */
export type ClaimFilterChoice =
  | { kind: 'tab'; value: DebateClaimListId }
  | { kind: 'space' | 'topic'; value: string; selected: boolean }
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
