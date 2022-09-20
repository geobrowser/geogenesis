import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import { FactsTable } from '~/modules/components/facts-table';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Button } from '~/modules/design-system/button';
import { FactsStore } from '~/modules/state/facts';
import { MockNetwork } from '~/modules/services/network';
import { useFacts } from '~/modules/state/hook';
import { Input } from '~/modules/design-system/input';
import { Log__factory } from '@geogenesis/contracts';
import { Root } from '@geogenesis/action-schema';
import { useSigner } from 'wagmi';

const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

const factsStore = new FactsStore({ api: new MockNetwork(), initialFacts: [] });

// 0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9

export default function Facts() {
  const { data } = useSigner();
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const { facts, createFact } = useFacts(factsStore);

  const debouncedFilter = debounce(setGlobalFilter, 150);

  const onAddFact = async () => {
    const contract = Log__factory.connect('0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9', data!);

    const root: Root = {
      type: 'root',
      version: '0.0.1',
      actions: [
        {
          type: 'createTriple',
          entityId: 'byron',
          attributeId: 'name',
          value: {
            type: 'string',
            value: 'Byron',
          },
        },
      ],
    };

    const tx = await contract.addEntry(
      `data:application/json;base64,${Buffer.from(JSON.stringify(root)).toString('base64')}`
    );

    // createFact({
    //   id: Math.random().toString(),
    //   entityId: Math.random().toString(),
    //   attribute: 'Died in',
    //   value: '2021',
    // });
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
