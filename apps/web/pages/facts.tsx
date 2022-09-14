import { useState } from 'react';
import styled from '@emotion/styled';
import { FactsTable } from '~/modules/components/facts-table';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { typography } from '~/modules/design-system/theme/typography';
import { Button } from '~/modules/design-system/button';

const Input = styled.input(props => ({
  ...props.theme.typography.input,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: '6px',
  padding: '9px 12px',

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },
}));

const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

export default function Facts() {
  const [globalFilter, setGlobalFilter] = useState<string>('');

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>
        <Button icon="create" onClick={() => console.log('Add!')}>
          Add
        </Button>
      </PageHeader>

      <Spacer height={12} />

      <Input placeholder="Search facts..." onChange={e => setGlobalFilter(e.target.value)} />

      <Spacer height={12} />

      <FactsTable globalFilter={globalFilter} />
    </PageContainer>
  );
}
