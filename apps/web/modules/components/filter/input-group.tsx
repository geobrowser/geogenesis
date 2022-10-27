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

export function FilterInputGroup() {
  return (
    <Flex>
      <SelectWrapper>
        <Select />
      </SelectWrapper>
      <Spacer width={12} />
      <Input />
    </Flex>
  );
}
