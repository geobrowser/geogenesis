import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button, SquareButton } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
import { ColorName } from '~/modules/design-system/theme/colors';
import { createEntityId, createTripleWithId } from '~/modules/services/create-id';
import { importCSVFile } from '~/modules/services/import';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useTriples } from '~/modules/state/use-triples';
import { ZERO_WIDTH_SPACE } from '../constants';
import { EntityNames, Triple, Value } from '../types';
import { getFilesFromFileList } from '../utils';
import { PREDEFINED_QUERIES } from './data/predefined-queries';
import { PredefinedQueriesContainer } from './predefined-queries/container';
import { TripleInput } from './triple-input';
import { TripleTable } from './triple-table';

const TableHeader = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});

const SpaceInfo = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 5,
}));

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

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export function Triples({
  spaceId,
  initialEntityNames,
  initialTriples,
  spaceImage,
  spaceName = ZERO_WIDTH_SPACE,
}: Props) {
  const [showPredefinedQueries, setShowPredefinedQueries] = useState(true);
  const { isEditor, isAdmin } = useAccessControl(spaceId);
  const tripleStore = useTriples();

  const onAddTriple = async () => {
    const entityId = createEntityId();
    const attributeId = '';
    const value: Value = { type: 'string', id: createEntityId(), value: '' };

    tripleStore.create([createTripleWithId(spaceId, entityId, attributeId, value)]);
  };

  const onImport = async (files: FileList) => {
    const triples = await importCSVFile(getFilesFromFileList(files), spaceId);
    tripleStore.create(triples);
  };

  return (
    <PageContainer>
      <TableHeader>
        <SpaceInfo>
          <SpaceImage
            src={spaceImage ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
          <Text flex="0 0 auto" variant="mainPage" as="h1">
            {spaceName}
          </Text>
        </SpaceInfo>
        {(isEditor || isAdmin) && (
          <>
            <TableHeader>
              <div style={{ flex: 1 }} />
              {isAdmin && (
                <Link href={`/space/${spaceId}/access-control`}>
                  <Button variant="secondary">Admin</Button>
                </Link>
              )}
              {isAdmin && isEditor && <Spacer width={12} />}
              {isEditor && (
                <>
                  <Button variant="secondary" icon="create">
                    Import
                    <FileImport
                      type="file"
                      accept=".csv"
                      multiple={true}
                      onChange={event => {
                        onImport(event.target.files ?? new FileList());
                      }}
                    />
                  </Button>
                  <Spacer width={12} />
                  <Button icon="create" onClick={onAddTriple}>
                    New entity
                  </Button>
                </>
              )}
            </TableHeader>
          </>
        )}
      </TableHeader>

      <Spacer height={40} />

      {showPredefinedQueries && (
        <>
          <motion.div
            style={{ width: '100%' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            <PredefinedQueriesContainer
              spaceName={spaceName}
              onSetFilterState={tripleStore.setFilterState}
              predefinedQueries={PREDEFINED_QUERIES[spaceName] ?? []}
            />
          </motion.div>
          <Spacer height={22} />
        </>
      )}

      <motion.div style={{ maxWidth: '100%' }} layout="position" transition={{ duration: 0.1 }}>
        <TripleInput
          showPredefinedQueries={showPredefinedQueries}
          onShowPredefinedQueriesChange={setShowPredefinedQueries}
        />

        <Spacer height={12} />

        <TripleTable
          space={spaceId}
          triples={tripleStore.triples.length === 0 ? initialTriples : tripleStore.triples}
          entityNames={Object.keys(tripleStore.entityNames).length === 0 ? initialEntityNames : tripleStore.entityNames}
          update={tripleStore.update}
        />

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
      </motion.div>

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

function PageNumber({ number, onClick, isActive }: { number: number; onClick?: () => void; isActive?: boolean }) {
  return (
    <SquareButton isActive={isActive} onClick={onClick}>
      <Text variant="smallButton">{number}</Text>
    </SquareButton>
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

const SpaceImage = styled.img({
  width: 56,
  height: 56,
  objectFit: 'cover',
  borderRadius: 8,
});
