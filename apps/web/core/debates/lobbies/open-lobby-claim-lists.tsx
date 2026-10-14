'use client';

import * as React from 'react';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import { type CreateDebateLobbyRequest, LOBBY_CLAIM_LISTS_MAX } from '../api';
import type { ClaimListOption } from '../claim-list-pages';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { hubPillClassName } from '../matchmaking/hub-pill-button';
import { CLAIM_LIST_PICKER_COPY, ClaimListPicker } from './lobby-claim-list-picker';
import { LobbyPopup } from './lobby-popup';

export const OPEN_LOBBY_CLAIM_LISTS_COPY = {
  label: 'Claim lists',
  optional: 'Optional',
  add: 'Add a list',
  full: `Up to ${LOBBY_CLAIM_LISTS_MAX} lists. ${CLAIM_LIST_PICKER_COPY.full}.`,
  hint: 'Shown as tabs in the lobby’s claims panel. You can change them in the lobby.',
};

/** A list picked for a lobby being opened: the page, the space it was picked from, its name. */
export type PickedClaimList = Pick<ClaimListOption, 'entityId' | 'spaceId' | 'name'>;

/**
 * The tabs a new lobby starts with, in pick order (GEO-3275). Nothing at all when none were
 * picked, so a host who skips the field sends exactly the request they sent before it existed.
 */
export function claimListsRequestField(
  lists: readonly Pick<PickedClaimList, 'entityId' | 'spaceId'>[]
): Pick<CreateDebateLobbyRequest, 'claim_lists'> {
  return lists.length > 0
    ? { claim_lists: lists.map(list => ({ entity_id: list.entityId, space_id: list.spaceId })) }
    : {};
}

/**
 * The Open a debate lobby dialog's optional Claim lists field: picked lists as removable chips, and
 * "Add a list" opening the in-lobby picker in the same popover (a sheet on phones), so the dialog
 * keeps its shape. Both render above the dialog: the popover inside it, the sheet in a higher layer.
 */
export function OpenLobbyClaimListsField({
  value,
  onChange,
}: {
  value: PickedClaimList[];
  onChange: (lists: PickedClaimList[]) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  const full = value.length >= LOBBY_CLAIM_LISTS_MAX;
  const addedIds = React.useMemo(() => value.map(list => list.entityId), [value]);

  return (
    <div className="grid gap-1.5" role="group" aria-label={OPEN_LOBBY_CLAIM_LISTS_COPY.label}>
      <Text as="span" variant="footnoteMedium">
        {OPEN_LOBBY_CLAIM_LISTS_COPY.label}
        <Text as="span" variant="footnote" color="grey-04">
          {' '}
          · {OPEN_LOBBY_CLAIM_LISTS_COPY.optional}
        </Text>
      </Text>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map(list => (
          <span
            key={list.entityId}
            // The "Add a list" pill's own type and shape, so picked lists and the button read as one row.
            className={hubPillClassName('tag', 'max-w-full gap-1 pr-1')}
          >
            <span className="max-w-[200px] truncate">{list.name}</span>
            <button
              type="button"
              aria-label={`Remove ${list.name}`}
              {...debateActionAnalyticsAttributes('hub', 'Open lobby remove claim list', 'remove_lobby_claim_list')}
              onClick={() => onChange(value.filter(other => other.entityId !== list.entityId))}
              className="grid size-5 shrink-0 place-items-center rounded-full text-grey-04 hover:bg-grey-02 hover:text-text"
            >
              <CloseSmall />
            </button>
          </span>
        ))}
        {full ? null : (
          <LobbyPopup
            open={picking}
            onOpenChange={setPicking}
            title={OPEN_LOBBY_CLAIM_LISTS_COPY.add}
            align="start"
            wide
            trigger={
              <button
                type="button"
                {...debateActionAnalyticsAttributes('hub', 'Open lobby add claim list', 'add_lobby_claim_list')}
                className={hubPillClassName('secondary')}
              >
                {OPEN_LOBBY_CLAIM_LISTS_COPY.add}
              </button>
            }
          >
            <ClaimListPicker
              addedIds={addedIds}
              analyticsLabel="Open lobby pick claim list"
              onPick={option => {
                onChange([...value, { entityId: option.entityId, spaceId: option.spaceId, name: option.name }]);
                setPicking(false);
              }}
            />
          </LobbyPopup>
        )}
      </div>
      <Text as="p" variant="footnote" color="grey-04">
        {full ? OPEN_LOBBY_CLAIM_LISTS_COPY.full : OPEN_LOBBY_CLAIM_LISTS_COPY.hint}
      </Text>
    </div>
  );
}
