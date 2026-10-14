'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { type CreateDebateLobbyRequest, LOBBY_CLAIM_LISTS_MAX } from '../api';
import type { ClaimListOption } from '../claim-list-pages';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { ClaimListPicker } from './lobby-claim-list-picker';

export const OPEN_LOBBY_CLAIM_LISTS_COPY = {
  label: 'Claim lists',
  optional: 'Optional',
  add: 'Add a list',
  close: 'Close list picker',
  full: `Up to ${LOBBY_CLAIM_LISTS_MAX} lists. Remove one to add another.`,
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
 * the in-lobby picker opened inline under them. Inline rather than as a popover, which inside a
 * modal dialog would have to fight it for the top layer.
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
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-grey-01 py-1 pr-1 pl-2.5 text-footnoteMedium text-text"
          >
            <span className="max-w-[200px] truncate">{list.name}</span>
            <button
              type="button"
              aria-label={`Remove ${list.name}`}
              data-geo-analytics-label="Open lobby remove claim list"
              onClick={() => onChange(value.filter(other => other.entityId !== list.entityId))}
              className="grid size-5 shrink-0 place-items-center rounded-full text-grey-04 hover:bg-grey-02 hover:text-text"
            >
              ×
            </button>
          </span>
        ))}
        {full ? null : (
          <HubPillButton
            analyticsLabel={picking ? 'Open lobby close claim list picker' : 'Open lobby add claim list'}
            aria-expanded={picking}
            onClick={() => setPicking(open => !open)}
          >
            {picking ? OPEN_LOBBY_CLAIM_LISTS_COPY.close : OPEN_LOBBY_CLAIM_LISTS_COPY.add}
          </HubPillButton>
        )}
      </div>
      {picking && !full ? (
        <div className="rounded-lg border border-grey-02">
          <ClaimListPicker
            addedIds={addedIds}
            analyticsLabel="Open lobby pick claim list"
            onPick={option => {
              onChange([...value, { entityId: option.entityId, spaceId: option.spaceId, name: option.name }]);
              setPicking(false);
            }}
          />
        </div>
      ) : null}
      <Text as="p" variant="footnote" color="grey-04">
        {full ? OPEN_LOBBY_CLAIM_LISTS_COPY.full : OPEN_LOBBY_CLAIM_LISTS_COPY.hint}
      </Text>
    </div>
  );
}
