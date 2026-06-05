'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Filter } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { ensureRankingAggregationRestriction } from '~/core/blocks/ranking/ensure-ranking-aggregation-restriction';
import { ensureRankingBlockTypeRelation } from '~/core/blocks/ranking/ensure-ranking-block-type';
import { ensureRankingShownColumns } from '~/core/blocks/ranking/ensure-ranking-shown-columns';
import { persistRankingBlockDateValues } from '~/core/blocks/ranking/persist-ranking-block-values';
import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditable } from '~/core/state/editable-store';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity, useValues } from '~/core/sync/use-store';

import { DateOnlyInput } from '~/design-system/editable-fields/date-field';

import { DataBlockScopeDropdown } from './data-block-scope-dropdown';
import { DataBlockTypeFilterSelect } from './data-block-type-filter-select';

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
  const { entity: blockEntity } = useQueryEntity({ spaceId, id: entityId });
  const { entity: blockRelationEntity } = useQueryEntity({ spaceId, id: relationId });
  const blockRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];
  const blockRelationRelations = blockRelationEntity?.relations ?? [];
  const existingValues = useValues({ selector: v => v.entity.id === entityId && v.spaceId === spaceId });
  const canEditSpace = useCanUserEdit(spaceId);
  const { setEditable } = useEditable();
  const { filterState, setFilterState } = useFilters(true);

  React.useEffect(() => {
    setEditable(true);
  }, [setEditable]);
  const { source, setSource } = useSource({ filterState, setFilterState });

  const [name, setNameDraft] = React.useState('');
  const nameInputRef = useAutofocus<HTMLInputElement>(true);
  const [selectedType, setSelectedType] = React.useState<{ id: string; name: string | null } | null>(null);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const typeFilter = filterState.find(f => f.columnId === SystemIds.TYPES_PROPERTY);

  React.useEffect(() => {
    if (typeFilter) {
      setSelectedType({ id: typeFilter.value, name: typeFilter.valueName });
    }
  }, [typeFilter?.value, typeFilter?.valueName]);

  const handleSelectType = (type: { id: string; name: string | null }) => {
    setSelectedType(type);
    const withoutTypes = filterState.filter(f => f.columnId !== SystemIds.TYPES_PROPERTY);
    const nextTypeFilter: Filter = {
      columnId: SystemIds.TYPES_PROPERTY,
      columnName: 'Types',
      valueType: 'RELATION',
      value: type.id,
      valueName: type.name,
    };
    setFilterState([...withoutTypes, nextTypeFilter]);
  };

  const hasTypeSelected = Boolean(selectedType?.id ?? typeFilter?.value);

  const handleCreate = React.useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || !hasTypeSelected || !canEditSpace) return;

    ensureRankingBlockTypeRelation({
      storage,
      blockId: entityId,
      spaceId,
      relations: blockRelations,
    });
    ensureRankingAggregationRestriction({
      storage,
      blockId: entityId,
      spaceId,
      relations: blockRelations,
    });
    persistBlockName(trimmed);
    ensureRankingShownColumns({
      storage,
      blockRelationId: relationId,
      spaceId,
      relations: blockRelationRelations,
    });
    setSource(source);
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
    blockRelationRelations,
    blockRelations,
    endDate,
    entityId,
    relationId,
    existingValues,
    canEditSpace,
    hasTypeSelected,
    onCompleteRankingSetup,
    name,
    setEditable,
    persistBlockName,
    setSource,
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
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              <DataBlockTypeFilterSelect
                selectedType={selectedType}
                onSelectType={handleSelectType}
                disabled={!canEditSpace}
                variant="setup"
              />
              <DataBlockScopeDropdown
                source={source}
                setSource={setSource}
                disabled={!canEditSpace}
                isEditing={canEditSpace}
                variant="setup"
              />
            </div>
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
