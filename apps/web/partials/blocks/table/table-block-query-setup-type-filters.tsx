'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { ID } from '~/core/id';

import { SmallButton } from '~/design-system/button';
import { CloseSmall } from '~/design-system/icons/close-small';
import { CreateSmall } from '~/design-system/icons/create-small';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

export type QuerySetupTypePick = { id: string; name: string | null };

type TableBlockQuerySetupTypeFiltersProps = {
  spaceId: string;
  selectedTypes: QuerySetupTypePick[];
  onChangeSelectedTypes: (next: QuerySetupTypePick[]) => void;
  disabled?: boolean;
};

export function TableBlockQuerySetupTypeFilters({
  spaceId,
  selectedTypes,
  onChangeSelectedTypes,
  disabled,
}: TableBlockQuerySetupTypeFiltersProps) {
  const { relationValueTypes, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: SystemIds.TYPES_PROPERTY,
    spaceId,
    relationValueTypes: undefined,
  });

  const canPickTypes = !waitForFilterTypes && Boolean(relationValueTypes?.length);

  const addType = React.useCallback(
    (result: { id: string; name: string | null }) => {
      if (selectedTypes.some(t => ID.equals(t.id, result.id))) return;
      onChangeSelectedTypes([...selectedTypes, { id: result.id, name: result.name }]);
    },
    [onChangeSelectedTypes, selectedTypes]
  );

  const removeType = React.useCallback(
    (id: string) => {
      onChangeSelectedTypes(selectedTypes.filter(t => !ID.equals(t.id, id)));
    },
    [onChangeSelectedTypes, selectedTypes]
  );

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2">
      <p className="text-center text-metadata text-grey-04">Optionally limit to specific types</p>
      <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
        {selectedTypes.map(t => (
          <span
            key={t.id}
            className="inline-flex h-6 max-w-[min(100%,280px)] shrink-0 items-center gap-0.5 rounded-[4px] border border-grey-02 bg-white pl-1.5 pr-0.5 text-metadata leading-none text-text"
          >
            <span className="min-w-0 truncate">{t.name ?? t.id.slice(0, 8)}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${t.name ?? 'type'}`}
              className="flex shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text disabled:pointer-events-none disabled:opacity-30"
              onClick={() => removeType(t.id)}
            >
              <CloseSmall color="currentColor" />
            </button>
          </span>
        ))}
        <SelectEntityAsPopover
          trigger={
            <SmallButton
              disabled={disabled || !canPickTypes}
              icon={<CreateSmall />}
              variant="secondary"
            >
              Add type
            </SmallButton>
          }
          spaceId={spaceId}
          placeholder="Find type…"
          relationValueTypes={relationValueTypes}
          waitForFilterTypes={waitForFilterTypes}
          restrictToFilterTypes={Boolean(relationValueTypes?.length)}
          advanced={false}
          showIDs={false}
          onDone={result => addType(result)}
        />
      </div>
      {waitForFilterTypes ? (
        <p className="text-center text-footnote text-grey-04">Loading types…</p>
      ) : !relationValueTypes?.length ? (
        <p className="text-center text-footnote text-grey-04">Type list unavailable; you can add type filters later.</p>
      ) : null}
    </div>
  );
}
