import * as React from 'react';

import { Button } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Select } from '~/modules/design-system/select';
import { Spacer } from '~/modules/design-system/spacer';
import { FilterClause, FilterField } from '~/modules/types';

interface Props {
  filterClause: FilterClause;
  onChange: (filterClause: FilterClause) => void;
  onDelete: () => void;
  options: FilterOption[];
  label: string;
  isDeletable: boolean;
}

export type FilterOption = {
  value: FilterField;
  label: string;
};

export function FilterInputGroup({ filterClause, onChange, options, label, onDelete, isDeletable }: Props) {
  return (
    <div className="flex items-center justify-center">
      <Button disabled variant="secondary" className="min-w-[67px] !bg-grey-01 !text-text !shadow-none">
        {label}
      </Button>
      <Spacer width={12} />
      <div className="flex flex-1">
        <Select
          options={options}
          value={filterClause.field}
          onChange={field => {
            const newFilterClause: FilterClause = { ...filterClause, field: field as FilterField };
            onChange(newFilterClause);
          }}
        />
      </div>
      <Spacer width={12} />
      <div className="flex flex-1">
        <Input
          value={filterClause.value}
          onChange={e => {
            const newFilterClause: FilterClause = { ...filterClause, value: e.currentTarget.value };
            onChange(newFilterClause);
          }}
        />
      </div>
      {isDeletable && (
        <>
          <Spacer width={12} />
          <Button icon="trash" variant="secondary" onClick={onDelete} />
        </>
      )}
    </div>
  );
}
