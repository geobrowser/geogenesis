import styled from '@emotion/styled';
import { Button, StyledLabel } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Select } from '~/modules/design-system/select';
import { Spacer } from '~/modules/design-system/spacer';
import { FilterClause, FilterField } from '~/modules/types';

const Flex = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const InputWrapper = styled.div({
  display: 'flex',
  flex: '1 1 0%',
});

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
    <Flex>
      <StyledLabel disabled variant="secondary">
        {label}
      </StyledLabel>
      <Spacer width={12} />
      <InputWrapper>
        <Select
          options={options}
          value={filterClause.field}
          onChange={field => {
            const newFilterClause: FilterClause = { ...filterClause, field: field as FilterField };
            onChange(newFilterClause);
          }}
        />
      </InputWrapper>
      <Spacer width={12} />
      <InputWrapper>
        <Input
          value={filterClause.value}
          onChange={e => {
            const newFilterClause: FilterClause = { ...filterClause, value: e.target.value };
            onChange(newFilterClause);
          }}
        />
      </InputWrapper>
      {isDeletable && (
        <>
          <Spacer width={12} />
          <Button icon="trash" variant="secondary" onClick={onDelete} />
        </>
      )}
    </Flex>
  );
}
