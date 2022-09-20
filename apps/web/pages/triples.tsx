import { useState } from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import { TripleTable } from '~/modules/components/triple-table';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Button } from '~/modules/design-system/button';
import { TripleStore } from '~/modules/state/triple-store';
import { Network } from '~/modules/services/network';
import { useTriples } from '~/modules/state/hook';
import { Input } from '~/modules/design-system/input';
import { Log__factory } from '@geogenesis/contracts';
import { useSigner } from 'wagmi';
import { Ipfs } from '~/modules/services/ipfs';

const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

const tripleStore = new TripleStore({ api: new Network(Log__factory, new Ipfs()), initialtriples: [] });

// 0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9
export default function Triples() {
  const { data } = useSigner();
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const { triples, createTriple } = useTriples(tripleStore);

  const debouncedFilter = debounce(setGlobalFilter, 150);

  const onAddTriple = async () => {
    createTriple(
      {
        id: Math.random().toString(),
        entity: {
          id: Math.random().toString(),
        },
        attribute: {
          id: 'Died in',
        },
        stringValue: '0',
      },
      data!
    );
  };

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>
        <Button icon="create" onClick={onAddTriple}>
          Add
        </Button>
      </PageHeader>

      <Spacer height={12} />

      <Input placeholder="Search facts..." onChange={e => debouncedFilter(e.target.value)} />

      <Spacer height={12} />

      <TripleTable triples={triples} globalFilter={globalFilter} />
    </PageContainer>
  );
}
