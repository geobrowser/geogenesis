'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { Effect } from 'effect';

import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useSearch } from '~/core/hooks/use-search';
import { useSearchProperties } from '~/core/hooks/use-search-properties';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { getProperty } from '~/core/io/queries';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property, SearchResult, SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';

import { EntityCreatedToast } from '~/design-system/autocomplete/entity-created-toast';
import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Search } from '~/design-system/icons/search';

import { createTypeRelationForNewEntity } from '~/partials/blocks/table/change-entry';
import { TYPE_ICONS } from '~/partials/entity-page/type-icons';

import { hydrateRelationValueTypes } from './import-generation';

type Step =
  | { kind: 'type' }
  | { kind: 'find'; propertyType: SwitchableRenderableType }
  | { kind: 'toType' }
  | { kind: 'relation'; toEntityType: { id: string; name: string | null } };

/**
 * Order matches the Figma reference: common scalar types first (Text/URL),
 * then relations and media, then booleans/numerics, then temporal, then
 * geo-related.
 */
const PROPERTY_TYPE_ORDER: SwitchableRenderableType[] = [
  'TEXT',
  'URL',
  'RELATION',
  'IMAGE',
  'VIDEO',
  'BOOLEAN',
  'INTEGER',
  'FLOAT',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'TIME',
  'POINT',
  'GEO_LOCATION',
  'PLACE',
  'ADDRESS',
];

interface PropertyMappingPopoverProps {
  spaceId: string;
  csvColumnIndex: number;
  onSelectProperty: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  trigger: React.ReactNode;
  initialQuery?: string;
  selectedEntityId?: string;
}

export function PropertyMappingPopover({
  spaceId,
  csvColumnIndex,
  onSelectProperty,
  onCreateProperty,
  trigger,
  initialQuery,
  selectedEntityId,
}: PropertyMappingPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>({ kind: 'type' });

  // Reset internal navigation whenever the popover closes so re-opening always
  // starts at the type picker.
  React.useEffect(() => {
    if (!open) setStep({ kind: 'type' });
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span
          data-jump-property={csvColumnIndex}
          className="mt-0.5 flex cursor-pointer items-center gap-1.5 rounded hover:bg-grey-02/50"
        >
          {trigger}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-1001 w-[440px] overflow-hidden rounded-md border border-grey-02 bg-white shadow-lg"
          collisionPadding={10}
          avoidCollisions
          onOpenAutoFocus={event => {
            // Let our own inputs autofocus instead of Radix's default focus
            // target — Step 1 has no input, and the other steps focus their
            // own search input on mount.
            if (step.kind === 'type') return;
            event.preventDefault();
          }}
        >
          {step.kind === 'type' && (
            <TypePickerView
              onSelect={propertyType => {
                if (propertyType === 'RELATION') {
                  setStep({ kind: 'toType' });
                } else {
                  setStep({ kind: 'find', propertyType });
                }
              }}
            />
          )}

          {step.kind === 'find' && (
            <FindOrCreatePropertyView
              spaceId={spaceId}
              propertyType={step.propertyType}
              initialQuery={initialQuery}
              selectedEntityId={selectedEntityId}
              onBack={() => setStep({ kind: 'type' })}
              onSelectProperty={onSelectProperty}
              onCreateProperty={onCreateProperty}
              csvColumnIndex={csvColumnIndex}
              close={close}
            />
          )}

          {step.kind === 'toType' && (
            <FindOrCreateToTypeView
              spaceId={spaceId}
              onBack={() => setStep({ kind: 'type' })}
              onSelect={toEntityType => setStep({ kind: 'relation', toEntityType })}
            />
          )}

          {step.kind === 'relation' && (
            <FindOrCreateRelationPropertyView
              spaceId={spaceId}
              toEntityType={step.toEntityType}
              initialQuery={initialQuery}
              selectedEntityId={selectedEntityId}
              onBack={() => setStep({ kind: 'toType' })}
              onSelectProperty={onSelectProperty}
              onCreateProperty={onCreateProperty}
              csvColumnIndex={csvColumnIndex}
              close={close}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Property type picker
// ---------------------------------------------------------------------------

function TypePickerView({ onSelect }: { onSelect: (type: SwitchableRenderableType) => void }) {
  return (
    <div>
      <div className="border-b border-grey-02 px-3 py-2.5 text-metadata text-text">Select property type</div>
      {/* Height is intentionally fractional so the last visible row is clipped
          mid-height. Without this, users can't tell the list scrolls. */}
      <div className="max-h-[270px] overflow-y-auto py-1">
        {PROPERTY_TYPE_ORDER.map(type => {
          const Icon = TYPE_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-100 hover:bg-grey-01 focus:bg-grey-01 focus:outline-hidden"
            >
              <span className="flex items-center gap-2">
                <Icon color="grey-04" />
                <span className="text-button text-text">{SWITCHABLE_RENDERABLE_TYPE_LABELS[type]}</span>
              </span>
              <ChevronRight color="grey-04" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared header used by all subsequent steps
// ---------------------------------------------------------------------------

function StepHeader({
  onBack,
  rightContent,
  title,
}: {
  onBack: () => void;
  rightContent: React.ReactNode;
  title?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-grey-02 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-button text-grey-04 transition-colors duration-100 hover:text-text"
        >
          <ArrowLeft color="grey-04" />
          <span>Back</span>
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-button text-grey-04">{rightContent}</div>
      </div>
      {title && <div className="border-b border-grey-02 px-3 py-2.5 text-resultTitle text-text">{title}</div>}
    </div>
  );
}

/** Right-side header chip: type icon + label, with optional `→ name` suffix. */
function TypeChip({
  propertyType,
  arrowTo,
}: {
  propertyType: SwitchableRenderableType;
  arrowTo?: string | null;
}) {
  const Icon = TYPE_ICONS[propertyType];
  return (
    <>
      <Icon color="grey-04" />
      <span className="truncate">{SWITCHABLE_RENDERABLE_TYPE_LABELS[propertyType]}</span>
      {arrowTo && (
        <>
          <RightArrowLongSmall color="grey-04" />
          <span className="truncate">{arrowTo}</span>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 (non-relation) — Find or create property filtered by chosen type
// ---------------------------------------------------------------------------

function FindOrCreatePropertyView({
  spaceId,
  propertyType,
  initialQuery,
  selectedEntityId,
  onBack,
  onSelectProperty,
  onCreateProperty,
  csvColumnIndex,
  close,
}: {
  spaceId: string;
  propertyType: SwitchableRenderableType;
  initialQuery?: string;
  selectedEntityId?: string;
  onBack: () => void;
  onSelectProperty: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  csvColumnIndex: number;
  close: () => void;
}) {
  const { baseDataType, renderableTypeId } = React.useMemo(() => mapPropertyType(propertyType), [propertyType]);

  const { store } = useSyncEngine();
  const { createProperty } = useCreateProperty(spaceId);
  const [, setToast] = useToast();

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearchProperties({
    dataType: baseDataType,
    renderableTypeId,
    initialQuery,
  });

  const typeLabel = SWITCHABLE_RENDERABLE_TYPE_LABELS[propertyType];

  const handleSelectExisting = async (result: { id: string; name: string | null }) => {
    let property: Property | null = store.getProperty(result.id);
    if (!property) property = await Effect.runPromise(getProperty(result.id));
    if (!property) {
      property = { id: result.id, name: result.name, dataType: baseDataType };
    }
    property = await hydrateRelationValueTypes(property);
    onSelectProperty(csvColumnIndex, result.id, property);
    close();
  };

  const handleCreate = (name: string) => {
    const propertyId = createProperty({ name, propertyType });
    const initial: Property = store.getProperty(propertyId) ?? {
      id: propertyId,
      name,
      dataType: baseDataType,
      renderableType: renderableTypeId,
    };
    const seeded: Property =
      initial.dataType === baseDataType ? initial : { ...initial, dataType: baseDataType, renderableType: renderableTypeId };

    void hydrateRelationValueTypes(seeded).then(hydrated => {
      onCreateProperty?.(csvColumnIndex, propertyId, hydrated);
    });
    setToast(<EntityCreatedToast entityId={propertyId} spaceId={spaceId} />);
    close();
  };

  return (
    <div>
      <StepHeader onBack={onBack} rightContent={<TypeChip propertyType={propertyType} />} />
      <SearchBlock
        query={query}
        onQueryChange={onQueryChange}
        isLoading={isLoading}
        isEmpty={isEmpty}
        results={results}
        selectedEntityId={selectedEntityId}
        placeholder={`Find or create ${typeLabel.toLowerCase()} property...`}
        onSelect={handleSelectExisting}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 (relation, sub-step A) — Find or create to-entity-type
// ---------------------------------------------------------------------------

function FindOrCreateToTypeView({
  spaceId,
  onBack,
  onSelect,
}: {
  spaceId: string;
  onBack: () => void;
  onSelect: (toEntityType: { id: string; name: string | null }) => void;
}) {
  const { storage } = useMutate();
  const [, setToast] = useToast();
  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes: [SystemIds.SCHEMA_TYPE],
  });

  const handleCreate = (name: string) => {
    const newEntityId = ID.createEntityId();
    storage.entities.name.set(newEntityId, spaceId, name);
    createTypeRelationForNewEntity(
      storage,
      spaceId,
      { id: newEntityId, name },
      { id: SystemIds.SCHEMA_TYPE, name: 'Type' }
    );
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
    onSelect({ id: newEntityId, name });
  };

  return (
    <div>
      <StepHeader
        onBack={onBack}
        rightContent={<TypeChip propertyType="RELATION" />}
        title="What type of entities are in this column?"
      />
      <SearchBlock
        query={query}
        onQueryChange={onQueryChange}
        isLoading={isLoading}
        isEmpty={isEmpty}
        results={results}
        placeholder="Find or create a type..."
        onSelect={result => onSelect({ id: result.id, name: result.name })}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 (relation, sub-step B) — Find or create relation property filtered by
// the chosen to-entity-type.
// ---------------------------------------------------------------------------

function FindOrCreateRelationPropertyView({
  spaceId,
  toEntityType,
  initialQuery,
  selectedEntityId,
  onBack,
  onSelectProperty,
  onCreateProperty,
  csvColumnIndex,
  close,
}: {
  spaceId: string;
  toEntityType: { id: string; name: string | null };
  initialQuery?: string;
  selectedEntityId?: string;
  onBack: () => void;
  onSelectProperty: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  csvColumnIndex: number;
  close: () => void;
}) {
  const { store } = useSyncEngine();
  const { createProperty } = useCreateProperty(spaceId);
  const [, setToast] = useToast();

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearchProperties({
    dataType: 'RELATION',
    renderableTypeId: null,
    requiredRelationValueTypeIds: [toEntityType.id],
    initialQuery,
  });

  const handleSelectExisting = async (result: { id: string; name: string | null }) => {
    let property: Property | null = store.getProperty(result.id);
    if (!property) property = await Effect.runPromise(getProperty(result.id));
    if (!property) {
      property = { id: result.id, name: result.name, dataType: 'RELATION' };
    }
    property = await hydrateRelationValueTypes(property);
    onSelectProperty(csvColumnIndex, result.id, property);
    close();
  };

  const handleCreate = (name: string) => {
    const propertyId = createProperty({
      name,
      propertyType: 'RELATION',
      relationValueTypes: [toEntityType],
    });

    const fromStore = store.getProperty(propertyId);
    const seeded: Property = fromStore ?? {
      id: propertyId,
      name,
      dataType: 'RELATION',
      renderableType: null,
      relationValueTypes: [toEntityType],
    };

    void hydrateRelationValueTypes(seeded).then(hydrated => {
      onCreateProperty?.(csvColumnIndex, propertyId, hydrated);
    });
    setToast(<EntityCreatedToast entityId={propertyId} spaceId={spaceId} />);
    close();
  };

  const toTypeName = toEntityType.name ?? 'type';

  return (
    <div>
      <StepHeader
        onBack={onBack}
        rightContent={<TypeChip propertyType="RELATION" arrowTo={toTypeName} />}
        title="Select a relation type"
      />
      <SearchBlock
        query={query}
        onQueryChange={onQueryChange}
        isLoading={isLoading}
        isEmpty={isEmpty}
        results={results}
        selectedEntityId={selectedEntityId}
        placeholder={`Find or create relation to ${toTypeName}...`}
        onSelect={handleSelectExisting}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified search block — owns input, keyboard navigation, results, and the
// create footer. Used by every step that has a search-and-create pattern.
// Results render via the shared design-system `ResultContent` so each row
// shows the space breadcrumb + type chips that the rest of the app uses.
// ---------------------------------------------------------------------------

function SearchBlock({
  query,
  onQueryChange,
  isLoading,
  isEmpty,
  results,
  selectedEntityId,
  placeholder,
  onSelect,
  onCreate,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  isLoading: boolean;
  isEmpty: boolean;
  results: SearchResult[];
  selectedEntityId?: string;
  placeholder: string;
  onSelect: (result: SearchResult) => void;
  onCreate: (name: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const resultsKey = results.map(r => r.id).join(',');

  // Reset the focused row when the result set identity changes so we don't
  // strand the highlight on a stale index.
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [resultsKey]);

  // Defer focus until after Radix's open-focus has run.
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Keep the selected row visible as the user navigates.
  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const trimmed = query.trim();
  const canCreate = trimmed.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (results.length === 0) return;
      event.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const focused = results[selectedIndex];
      if (focused) {
        onSelect(focused);
      } else if (canCreate) {
        onCreate(trimmed);
      }
    }
  };

  return (
    <>
      <div className="p-2">
        <div className="relative">
          <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
            <Search />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            className="w-full rounded-md border border-grey-02 bg-white py-2 pr-3 pl-9 text-button text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
          />
        </div>
      </div>
      <ResultsArea
        isLoading={isLoading}
        isEmpty={isEmpty}
        query={query}
        results={results}
        selectedEntityId={selectedEntityId}
        selectedIndex={selectedIndex}
        onHoverIndex={setSelectedIndex}
        itemRefs={itemRefs}
        onSelect={onSelect}
      />
      <div className="flex items-center justify-center border-t border-grey-02 py-2.5">
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => onCreate(trimmed)}
          className="text-button text-ctaHover transition-colors duration-100 hover:text-ctaPrimary disabled:text-grey-03"
        >
          Create new
        </button>
      </div>
    </>
  );
}

/**
 * Renders the search results using the design-system `ResultContent` (the same
 * row used in `SelectEntityAsPopover`, autocomplete search, etc.). The
 * fractional `max-h-[340px]` on `ResultsList` clips the last visible row mid-
 * height, giving the user a visual cue that the list scrolls.
 */
function ResultsArea({
  isLoading,
  isEmpty,
  query,
  results,
  selectedEntityId,
  selectedIndex,
  onHoverIndex,
  itemRefs,
  onSelect,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  query: string;
  results: SearchResult[];
  selectedEntityId?: string;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  itemRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  onSelect: (result: SearchResult) => void;
}) {
  if (!query) {
    return <div className="px-3 py-3 text-metadata text-grey-04">Start typing to search…</div>;
  }

  if (isLoading && results.length === 0) {
    return <div className="px-3 py-3 text-metadata text-grey-04">Loading…</div>;
  }

  if (isEmpty) {
    return <div className="px-3 py-3 text-metadata text-grey-04">No matches.</div>;
  }

  return (
    <ResultsList className="divide-y divide-divider">
      {results.map((result, index) => (
        <div
          key={result.id}
          ref={el => {
            itemRefs.current[index] = el;
          }}
          onMouseEnter={() => onHoverIndex(index)}
        >
          <ResultContent
            result={result}
            active={index === selectedIndex}
            alreadySelected={selectedEntityId === result.id}
            withDescription={false}
            onClick={() => onSelect(result)}
          />
        </div>
      ))}
    </ResultsList>
  );
}
