import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { GetServerSideProps } from 'next';
import dynamic from 'next/dynamic';
import React from 'react';
import { FilterDialog } from '~/modules/components/filter/dialog';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button, SmallButton } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
import { ColorName } from '~/modules/design-system/theme/colors';
import { createEntityId, createTripleId } from '~/modules/services/create-id';
import { importCSVFile } from '~/modules/services/import';
import { TripleStoreProvider } from '~/modules/state/triple-store-provider';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useEditable } from '~/modules/state/use-editable';
import { useTriples } from '~/modules/state/use-triples';

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

export default function TriplesPage({ spaceId }: { spaceId: string }) {
  return (
    <TripleStoreProvider space={spaceId}>
      <Triples space={spaceId} />
    </TripleStoreProvider>
  );
}

const PageNumberContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
});

function PageNumber({ number, onClick, isActive }: { number: number; onClick?: () => void; isActive?: boolean }) {
  return (
    <SmallButton isActive={isActive} onClick={onClick}>
      <Text variant="smallButton">{number}</Text>
    </SmallButton>
  );
}

interface PageButtonProps {
  onClick: () => void;
  isDisabled: boolean;
}

function PreviousButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={onClick}>
      <LeftArrowLong color={color} />
      <Spacer width={8} />
      <Text color={color} variant="smallButton">
        Previous
      </Text>
    </TextButton>
  );
}

function NextButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={onClick}>
      <Text color={color} variant="smallButton">
        Next
      </Text>
      <Spacer width={8} />
      <span
        style={{
          transform: 'rotate(180deg)',
        }}
      >
        <LeftArrowLong color={color} />
      </span>
    </TextButton>
  );
}

const InputContainer = styled.div({
  width: '100%',
  display: 'flex',
  position: 'relative',
});

const InputIcon = styled.div(props => ({
  position: 'absolute',
  right: props.theme.space * 2.5,
  top: props.theme.space * 2.5,
}));

function Triples({ space }: { space: string }) {
  const { isEditor } = useAccessControl(space);

  const tripleStore = useTriples();
  const { toggleEditable, editable } = useEditable();
  const inputContainerRef = React.useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

  const onAddTriple = async () => {
    const entityId = createEntityId();
    const attributeId = '';
    const value = { type: 'string' as const, value: '' };

    tripleStore.create([
      {
        id: createTripleId(space, entityId, attributeId, value),
        entityId,
        attributeId,
        value,
        space,
      },
    ]);
  };

  const onImport = async (file: File) => {
    const triples = await importCSVFile(file, space);
    tripleStore.create(triples);
  };

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>

        {isEditor && (
          <>
            <PageHeader>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" onClick={toggleEditable}>
                Turn {editable ? 'off' : 'on'} editing
              </Button>
              <Spacer width={12} />
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
          </>
        )}
      </PageHeader>

      <Spacer height={12} />

      <InputContainer ref={inputContainerRef}>
        <Input
          placeholder="Search facts..."
          onChange={e => tripleStore.setQuery(e.target.value)}
          value={tripleStore.query}
        />
        <InputIcon>
          <FilterDialog
            inputContainerWidth={inputRect?.width || 0}
            filterState={tripleStore.filterState}
            setFilterState={tripleStore.setFilterState}
          />
        </InputIcon>
      </InputContainer>

      <Spacer height={12} />

      <TripleTable space={space} triples={tripleStore.triples} update={tripleStore.update} />

      <Spacer height={12} />

      <PageNumberContainer>
        {tripleStore.pageNumber > 1 && (
          <>
            <PageNumber number={1} onClick={() => tripleStore.setPageNumber(0)} />
            {tripleStore.pageNumber > 2 ? (
              <>
                <Spacer width={16} />
                <Text color="grey-03" variant="metadataMedium">
                  ...
                </Text>
                <Spacer width={16} />
              </>
            ) : (
              <Spacer width={4} />
            )}
          </>
        )}
        {tripleStore.hasPreviousPage && (
          <>
            <PageNumber number={tripleStore.pageNumber} onClick={tripleStore.setPreviousPage} />
            <Spacer width={4} />
          </>
        )}
        <PageNumber isActive number={tripleStore.pageNumber + 1} />
        {tripleStore.hasNextPage && (
          <>
            <Spacer width={4} />
            <PageNumber number={tripleStore.pageNumber + 2} onClick={tripleStore.setNextPage} />
          </>
        )}
        <Spacer width={32} />
        <PreviousButton isDisabled={!tripleStore.hasPreviousPage} onClick={tripleStore.setPreviousPage} />
        <Spacer width={12} />
        <NextButton isDisabled={!tripleStore.hasNextPage} onClick={tripleStore.setNextPage} />
      </PageNumberContainer>

      <FlowBar actionsCount={tripleStore.actions.length} onPublish={tripleStore.publish} />
    </PageContainer>
  );
}

export const getServerSideProps: GetServerSideProps = async context => {
  const spaceId = context.params?.id as string;

  return {
    props: {
      spaceId,
    },
  };
};
