import * as React from 'react';
import { useRef } from 'react';
import { useRect } from '@radix-ui/react-use-rect';

import { CheckCloseSmall } from '../design-system/icons/check-close-small';
import { Search } from '../design-system/icons/search';
import { Input } from '../design-system/input';
import { Spacer } from '../design-system/spacer';
import { useTriples } from '../triple/use-triples';
import { FilterDialog } from './filter/dialog';
import type { FilterClause } from '../types';

export function TripleInput() {
  const tripleStore = useTriples();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);
  const showBasicFilter = tripleStore.filterState.length === 0;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    tripleStore.setQuery(event.target.value);
  };

  const onAdvancedFilterClick = (field: FilterClause['field']) => {
    const filteredFilters = tripleStore.filterState.filter(filter => filter.field !== field);
    tripleStore.setFilterState(filteredFilters);
  };

  return (
    <div className="relative flex overflow-hidden" ref={inputContainerRef}>
      <div className="absolute left-3 top-2.5 z-100">
        <Search />
      </div>
      {showBasicFilter ? (
        <Input
          withExternalSearchIcon
          withFilterIcon
          placeholder="Search facts..."
          value={tripleStore.query}
          onChange={onChange}
        />
      ) : (
        <div className="flex w-full items-center gap-1 overflow-hidden rounded-l bg-white pl-10 shadow-inner-grey-02">
          {tripleStore.filterState.map(filter => (
            <AdvancedFilterPill
              key={filter.field}
              filterClause={filter}
              onClick={() => onAdvancedFilterClick(filter.field)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center overflow-hidden rounded-r border border-l-0 border-grey-02 bg-white text-grey-04">
        <FilterDialog
          inputContainerWidth={inputRect?.width || 578}
          filterState={tripleStore.filterState}
          setFilterState={tripleStore.setFilterState}
        />
      </div>
    </div>
  );
}

interface AdvancedFilterPillprops {
  filterClause: FilterClause;
  onClick: () => void;
}

function AdvancedFilterPill({ filterClause, onClick }: AdvancedFilterPillprops) {
  const { field, value } = filterClause;
  const label = filterLabels[field];

  return (
    <button
      className="flex items-center overflow-hidden whitespace-nowrap rounded bg-white p-2 py-1 text-metadataMedium shadow-inner-grey-02 hover:cursor-pointer hover:bg-bg hover:shadow-inner-text focus:bg-bg focus:shadow-inner-lg-text focus:outline-none"
      onClick={onClick}
    >
      {label} {value}
      <Spacer width={8} />
      <CheckCloseSmall />
    </button>
  );
}

const filterLabels: Record<string, string> = {
  'entity-id': 'Entity ID is',
  'entity-name': 'Entity name contains',
  'attribute-name': 'Attribute name contains',
  'attribute-id': 'Attribute ID is',
  value: 'Value contains',
  'linked-to': 'Entity contains reference to',
};
