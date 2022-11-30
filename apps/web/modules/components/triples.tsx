import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import React, { useState } from 'react';
import { FilterDialog } from '~/modules/components/filter/dialog';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button, IconButton, SquareButton } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
import { ColorName } from '~/modules/design-system/theme/colors';
import { createEntityId, createTripleWithId } from '~/modules/services/create-id';
import { importCSVFile } from '~/modules/services/import';
import { TripleStoreProvider } from '~/modules/state/triple-store-provider';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useTriples } from '~/modules/state/use-triples';
import { SYSTEM_IDS, ZERO_WIDTH_SPACE } from '../constants';
import { Search } from '../design-system/icons/search';
import { useSpaces } from '../state/use-spaces';
import { Value } from '../types';
import { getFilesFromFileList } from '../utils';
import { PredefinedQueriesContainer } from './predefined-queries/container';
import TripleTable from './triple-table';

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
}

export default function TriplesPage({ spaceId }: Props) {
  return (
    <TripleStoreProvider space={spaceId}>
      <Triples spaceId={spaceId} />
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

const InputContainer = styled.div({
  width: '100%',
  display: 'flex',
  position: 'relative',
});

const TriplesInput = styled(Input)(props => ({
  width: '100%',
  borderRadius: `${props.theme.radius}px 0 0 ${props.theme.radius}px`,
  paddingLeft: props.theme.space * 10,
}));

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 100,
}));

const FilterIconContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  backgroundColor: props.theme.colors.white,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderLeft: 'none',
}));

const PresetIconContainer = styled(FilterIconContainer)<{ showPredefinedQueries: boolean }>(props => ({
  cursor: 'pointer',
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  backgroundColor: props.showPredefinedQueries ? props.theme.colors['grey-01'] : props.theme.colors.white,
  borderLeft: 'none',
  transition: 'colors 0.15s ease-in-out',

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
  },

  button: {
    padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,

    '&:active': {
      color: props.theme.colors.text,
      outlineColor: props.theme.colors.ctaPrimary,
    },

    '&:focus': {
      color: props.theme.colors.text,
      outlineColor: props.theme.colors.ctaPrimary,
    },
  },
}));

const SpaceImage = styled.img({
  width: 56,
  height: 56,
  objectFit: 'cover',
  borderRadius: 8,
});

function Triples({ spaceId }: Props) {
  const [showPredefinedQueries, setShowPredefinedQueries] = useState(true);
  const { isEditor, isAdmin } = useAccessControl(spaceId);

  const tripleStore = useTriples();
  const inputContainerRef = React.useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

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

  const { spaces } = useSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceName = space?.attributes.name ?? ZERO_WIDTH_SPACE;
  const spaceImage =
    space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF';

  return (
    <PageContainer>
      <TableHeader>
        <SpaceInfo>
          <SpaceImage src={spaceImage} alt={`Cover image for ${spaceName}`} />
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
                  <Button variant="secondary" icon="create" onClick={() => {}}>
                    Import
                    <FileImport
                      type="file"
                      accept=".csv"
                      multiple={true}
                      onChange={event => {
                        onImport(event.target.files ?? []);
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
        <motion.div style={{ width: '100%' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PredefinedQueriesContainer name={spaceName} />
        </motion.div>
      )}

      <Spacer height={showPredefinedQueries ? 21.5 : 12} />

      <motion.div layout="position">
        <InputContainer ref={inputContainerRef}>
          <SearchIconContainer>
            <Search />
          </SearchIconContainer>
          <TriplesInput
            placeholder="Search facts..."
            onChange={e => tripleStore.setQuery(e.target.value)}
            value={tripleStore.query}
          />
          <FilterIconContainer>
            <FilterDialog
              inputContainerWidth={inputRect?.width || 0}
              filterState={tripleStore.filterState}
              setFilterState={tripleStore.setFilterState}
            />
          </FilterIconContainer>
          <PresetIconContainer showPredefinedQueries={showPredefinedQueries}>
            <IconButton onClick={() => setShowPredefinedQueries(!showPredefinedQueries)} icon="preset" />
          </PresetIconContainer>
        </InputContainer>

        <Spacer height={12} />

        <TripleTable space={spaceId} triples={tripleStore.triples} update={tripleStore.update} />

        <Spacer height={12} />

        {tripleStore.hasNextPage ||
          (true && (
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
          ))}
      </motion.div>

      <FlowBar actionsCount={tripleStore.actions.length} onPublish={tripleStore.publish} />
    </PageContainer>
  );
}
