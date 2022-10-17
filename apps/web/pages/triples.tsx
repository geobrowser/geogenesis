import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
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
  const tripleStore = useTriples();

  const debouncedFilter = debounce(tripleStore.setQuery, 500);

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
    tripleStore.create(triples.slice(0, 2000));
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

      <TripleTable triples={tripleStore.triples} update={tripleStore.update} />

      <Spacer height={12} />

      <PageNumberContainer>
        <PageNumber number={1} onClick={() => tripleStore.setPageNumber(0)} isActive={tripleStore.pageNumber === 0} />
        <Spacer width={6} />
        <PageNumber number={2} onClick={() => tripleStore.setPageNumber(1)} isActive={tripleStore.pageNumber === 1} />

        <Spacer width={40} />

        <PreviousButton onClick={() => tripleStore.setPreviousPage()} />
        <Spacer width={20} />
        <NextButton onClick={() => tripleStore.setNextPage()} />
      </PageNumberContainer>

      <FlowBar actionsCount={tripleStore.actions.length} onPublish={tripleStore.publish} />
    </PageContainer>
  );
}

const PageNumberContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
});

function PageNumber({ number, onClick, isActive }: { number: number; onClick: () => void; isActive: boolean }) {
  return (
    <Button variant="secondary" square isActive={isActive} onClick={onClick}>
      <Text variant="smallButton">{number}</Text>
    </Button>
  );
}

function PreviousButton({ onClick }: { onClick: () => void }) {
  const theme = useTheme();

  return (
    <TextButton onClick={onClick}>
      <LeftArrowLong color={theme.colors.ctaPrimary} />
      <Spacer width={8} />
      <Text color="ctaPrimary" variant="smallButton">
        Previous
      </Text>
    </TextButton>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  const theme = useTheme();

  return (
    <TextButton onClick={onClick}>
      <Text color="ctaPrimary" variant="smallButton">
        Next
      </Text>
      <Spacer width={8} />
      <span
        style={{
          transform: 'rotate(180deg)',
        }}
      >
        <LeftArrowLong color={theme.colors.ctaPrimary} />
      </span>
    </TextButton>
  );
}
