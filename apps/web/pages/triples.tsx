import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { createEntityId, createTripleId } from '~/modules/services/create-id';
import { importCSVFile } from '~/modules/services/import';
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
  width: '100%',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const FileImport = styled.input({
  margin: '0',
  padding: '0',
  opacity: '0',
  position: 'absolute',
  inset: '0',
});

export default function Triples() {
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const tripleStore = useTriples();

  const debouncedFilter = debounce(setGlobalFilter, 500);

  const onAddTriple = async () => {
    const entityId = createEntityId();
    const attributeId = '';
    const value = { type: 'string' as const, value: '' };

    tripleStore.create([
      {
        id: createTripleId(entityId, attributeId, value),
        entityId,
        attributeId,
        value,
      },
    ]);
  };

  const onImport = async (file: File) => {
    const triples = await importCSVFile(file);
    tripleStore.create(triples);
  };

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>

        <div style={{ flex: 1 }} />
        <Button variant="secondary" icon="create" onClick={() => {}}>
          Import
          <FileImport
            type="file"
            accept=".csv"
            onChange={event => {
              for (let file of event.target.files ?? []) {
                onImport(file);
              }
            }}
          />
        </Button>
        <Spacer width={12} />
        <Button icon="create" onClick={onAddTriple}>
          Add
        </Button>
      </PageHeader>

      <Spacer height={12} />

      <Input placeholder="Search facts..." onChange={e => debouncedFilter(e.target.value)} />

      <Spacer height={12} />

      <TripleTable
        entityNames={tripleStore.entityNames}
        triples={tripleStore.triples}
        update={tripleStore.update}
        globalFilter={globalFilter}
      />

      <FlowBar changedTriples={tripleStore.changedTriples} onPublish={tripleStore.publish} />
    </PageContainer>
  );
}
