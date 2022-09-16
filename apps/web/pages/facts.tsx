import { useState } from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import { FactsTable } from '~/modules/components/facts-table';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Button } from '~/modules/design-system/button';
import { FactsStore } from '~/modules/state/facts';
import { MockNetwork } from '~/modules/services/network';
import { IFact } from '~/modules/types';
import { useFacts } from '~/modules/state/hook';
import { Input } from '~/modules/design-system/input';


const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

const data: IFact[] = Array.from({ length: 3 }, (_, index) => {
  return {
    id: index.toString(),
    entityId: index.toString(),
    attribute: 'name',
    value: 'John Doe' + ' ' + index,
  };
});

const factsStore = new FactsStore({ api: new MockNetwork(), initialFacts: [] });

export default function Facts() {
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const { facts, createFact } = useFacts(factsStore);

  const debouncedFilter = debounce(setGlobalFilter, 150);

  const onAddFact = () => {
    createFact({
      id: Math.random().toString(),
      entityId: Math.random().toString(),
      attribute: 'Died in',
      value: '2021',
    });
  };

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>
        <Button icon="create" onClick={onAddFact}>
          Add
        </Button>
      </PageHeader>

      <Spacer height={12} />

      <Input placeholder="Search facts..." onChange={e => debouncedFilter(e.target.value)} />

      <Spacer height={12} />

      <FactsTable facts={facts} globalFilter={globalFilter} />
    </PageContainer>
  );
}
