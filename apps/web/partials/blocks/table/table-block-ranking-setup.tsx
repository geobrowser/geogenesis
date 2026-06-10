'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Filter } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { ensureRankingAggregationRestriction } from '~/core/blocks/ranking/ensure-ranking-aggregation-restriction';
import { ensureRankingBlockTypeRelation } from '~/core/blocks/ranking/ensure-ranking-block-type';
import { ensureRankingShownColumns } from '~/core/blocks/ranking/ensure-ranking-shown-columns';
import { persistRankingBlockDateValues } from '~/core/blocks/ranking/persist-ranking-block-values';
import { useRankingScope } from '~/core/blocks/ranking/use-ranking-scope';
import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditable } from '~/core/state/editable-store';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity, useValues } from '~/core/sync/use-store';

import { DateOnlyInput } from '~/design-system/editable-fields/date-field';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { DataBlockScopeDropdown } from './data-block-scope-dropdown';
import { type QuerySetupTypePick, QuerySetupTypesSelectEntityPopover } from './query-setup-types-select-entity-popover';

type Props = {
  spaceId: string;
  onCompleteRankingSetup: (dates: { startDate: string; endDate: string }) => void;
};

export function TableBlockRankingSetup({ spaceId, onCompleteRankingSetup }: Props) {
  const { setName: persistBlockName } = useDataBlock();
  const { entityId, relationId } = useDataBlockInstance();
  const { storage } = useMutate();
  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;
  const blocksRelationEntityId = relationId;
  const { entity: blockEntity } = useQueryEntity({ spaceId, id: entityId });
  const { entity: blockRelationEntity } = useQueryEntity({ spaceId, id: blocksRelationEntityId });
  const blockEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];
  const blockRelationRelations = blockRelationEntity?.relations ?? [];
  const existingValues = useValues({ selector: v => v.entity.id === entityId && v.spaceId === spaceId });
  const canEditSpace = useCanUserEdit(spaceId);
  const { setEditable } = useEditable();
  const { filterState, setFilterState } = useFilters(true);

  React.useEffect(() => {
    setEditable(true);
  }, [setEditable]);
  const { source, setSource } = useRankingScope({ filterState, setFilterState });

  const [name, setNameDraft] = React.useState('');
  const nameInputRef = useAutofocus<HTMLInputElement>(true);
  const [setupTypePicks, setSetupTypePicks] = React.useState<QuerySetupTypePick[]>([]);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const { relationValueTypes: allowedTargetTypes, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: SystemIds.TYPES_PROPERTY,
    spaceId,
    relationValueTypes: undefined,
  });
  const canPickTypes = !waitForFilterTypes && Boolean(allowedTargetTypes?.length);
  const selectedTypeCount = setupTypePicks.length;
  const typeTriggerLabel =
    selectedTypeCount > 0
      ? `${selectedTypeCount} ${selectedTypeCount === 1 ? 'type' : 'types'} selected`
      : 'Select type...';

  const hasTypeSelected = setupTypePicks.length > 0;

  const handleCreate = React.useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || !hasTypeSelected || !canEditSpace) return;

    ensureRankingBlockTypeRelation({
      storage,
      blockId: entityId,
      spaceId,
      relations: blockEntityRelations,
    });
    ensureRankingAggregationRestriction({
      storage,
      blockId: entityId,
      spaceId,
      relations: blockEntityRelations,
    });
    persistBlockName(trimmed);
    ensureRankingShownColumns({
      storage,
      blockRelationId: blocksRelationEntityId,
      spaceId,
      relations: blockRelationRelations,
    });

    const withoutTypes = filterState.filter(f => f.columnId !== SystemIds.TYPES_PROPERTY);
    const typeFilters: Filter[] = setupTypePicks.map(t => ({
      columnId: SystemIds.TYPES_PROPERTY,
      columnName: 'Types',
      valueType: 'RELATION',
      value: t.id,
      valueName: [t.name, t.spaceName].filter((x): x is string => Boolean(x)).join(' · ') || t.name,
      ...(t.spaceId ? { typesRelationSpaceId: t.spaceId } : {}),
    }));
    const mergedFilters = [...withoutTypes, ...typeFilters];
    setSource(source, { filterStateOverride: mergedFilters });
    persistRankingBlockDateValues({
      storage,
      entityId,
      spaceId,
      startDate,
      endDate,
      existingValues,
    });
    setEditable(true);
    onCompleteRankingSetup({ startDate, endDate });
  }, [
    blockEntityRelations,
    blockRelationRelations,
    blocksRelationEntityId,
    endDate,
    entityId,
    existingValues,
    canEditSpace,
    filterState,
    hasTypeSelected,
    onCompleteRankingSetup,
    name,
    setEditable,
    persistBlockName,
    setSource,
    setupTypePicks,
    source,
    spaceId,
    startDate,
    storage,
  ]);

  const canCreate = canEditSpace && name.trim().length > 0 && hasTypeSelected;

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }} onMouseDown={e => e.stopPropagation()}>
      <div className="flex flex-col items-center rounded-lg bg-grey-01 px-6 py-8">
        <div className="flex w-full max-w-[420px] flex-col items-center gap-6">
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-center text-button font-medium text-text">
              What do you want to rank? <span className="text-grey-04">(required)</span>
            </p>
            <input
              ref={nameInputRef}
              id="ranking-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={e => setNameDraft(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
              onKeyDownCapture={e => e.stopPropagation()}
              onKeyUp={e => e.stopPropagation()}
              onFocus={e => e.stopPropagation()}
              placeholder="Name... (e.g. top people in crypto)"
              aria-label="Ranking name"
              className="w-full border-0 bg-grey-01 text-center text-button font-medium text-text outline-hidden placeholder:text-grey-03"
            />
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-center text-button font-medium text-text">Filter entities to be ranked</p>
            <div
              className="flex w-full flex-wrap items-center justify-center gap-2"
              onMouseDown={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
              <QuerySetupTypesSelectEntityPopover
                disabled={!canEditSpace || !canPickTypes}
                selectedTypes={setupTypePicks}
                onChangeSelectedTypes={setSetupTypePicks}
                allowedTargetTypes={allowedTargetTypes}
                trigger={
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    className="inline-flex h-6 max-w-[min(100%,280px)] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded border border-grey-02 bg-white px-1.5 text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                    aria-label={
                      selectedTypeCount > 0
                        ? `${selectedTypeCount} ${selectedTypeCount === 1 ? 'type' : 'types'} selected`
                        : 'Select type'
                    }
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{typeTriggerLabel}</span>
                    <span className="inline-flex shrink-0">
                      <ChevronDownSmall color="grey-04" />
                    </span>
                  </button>
                }
              />
              <DataBlockScopeDropdown
                source={source}
                setSource={setSource}
                disabled={!canEditSpace}
                isEditing={canEditSpace}
                variant="setup"
              />
            </div>
            {waitForFilterTypes ? (
              <p className="text-center text-footnote text-grey-04">Loading types…</p>
            ) : !allowedTargetTypes?.length ? (
              <p className="text-center text-footnote text-grey-04">No types available for this block.</p>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-start justify-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <p className="text-button font-medium text-text">Start date</p>
              <DateOnlyInput variant="body" initialDate={startDate} onDateChange={setStartDate} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-button font-medium text-text">End date</p>
              <DateOnlyInput variant="body" initialDate={endDate} onDateChange={setEndDate} />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded border border-grey-02 bg-white px-8 py-2 text-button text-text shadow-button transition hover:border-text focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04 disabled:pointer-events-none disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </motion.div>
  );
}
