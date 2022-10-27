import styled from '@emotion/styled';
import { Input } from '~/modules/design-system/input';
import { Select } from '~/modules/design-system/select';
import { Spacer } from '~/modules/design-system/spacer';

const Flex = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const SelectWrapper = styled.div({
  display: 'flex',
  flexBasis: '33%',
});

const options = [
  {
    label: 'Is a',
    value: 'is-a',
  },
  {
    label: 'Is not a',
    value: 'is-not-a',
  },
];

export function FilterInputGroup() {
  return (
    <Flex>
      <SelectWrapper>
        <Select options={options} value={options[0].value} onChange={() => {}} />
      </SelectWrapper>
      <Spacer width={12} />
      <Input />
    </Flex>
  );
}
