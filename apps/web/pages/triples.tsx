import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSigner } from 'wagmi';
import { Button } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useTripleStore } from '~/modules/services';
import { createEntityId, createTripleId } from '~/modules/services/create-id';
import { useTriples } from '~/modules/state/hook';

// We're dynamically importing the TripleTable so we can disable SSR. There are ocassionally hydration
// mismatches in dev (maybe prod?) that happen when reloading a page when the table has optimistic data
// but the server does not have the data yet, e.g., we're waiting for blocks to sync or the transaction
// did not go through.
//
// I _think_ this only happens in dev as Next might be doing SSR/HMR under the hood for static pages,
// but could be happening in prod. Doing dynamic import for now until we can investigate more.
const TripleTable = dynamic(() => import('~/modules/components/triple-table'), {
  ssr: false,
});

const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

export default function Triples() {
  const { data: signer } = useSigner();
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const tripleStore = useTripleStore();
  const { triples, createTriple } = useTriples(tripleStore);

  const debouncedFilter = debounce(setGlobalFilter, 150);

  const onAddTriple = async () => {
    if (!signer) return;

    const entityId = createEntityId();
    const attributeId = 'Died in';
    const value = { type: 'string' as const, value: '0' };

    createTriple(
      {
        id: createTripleId(entityId, attributeId, value),
        entityId,
        attributeId,
        value,
      },
      signer
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
