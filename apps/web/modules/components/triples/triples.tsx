import { motion } from 'framer-motion';
import { useState } from 'react';
import { SquareButton } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
import { ColorName } from '~/modules/design-system/theme/colors';
// import { importCSVFile } from '~/modules/services/import';
import { useTriples } from '~/modules/state/use-triples';
import { ZERO_WIDTH_SPACE } from '../../constants';
import { EntityNames, Triple } from '../../types';
// import { getFilesFromFileList } from '../utils';
import { PREDEFINED_QUERIES } from '../data/predefined-queries';
import { PredefinedQueriesContainer } from '../predefined-queries/container';
import { PageContainer, PageNumberContainer } from '../table/styles';
import { TripleInput } from './triple-input';
import { TripleTable } from './triple-table';

// const FileImport = styled.input({
//   margin: '0',
//   padding: '0',
//   opacity: '0',
//   position: 'absolute',
//   inset: '0',
// });

interface Props {
  spaceId: string;
  spaceName?: string;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export function Triples({ spaceId, initialEntityNames, initialTriples, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const [showPredefinedQueries, setShowPredefinedQueries] = useState(true);
  const tripleStore = useTriples();

  // const onImport = async (files: FileList) => {
  //   const triples = await importCSVFile(getFilesFromFileList(files), spaceId);
  //   tripleStore.create(triples);
  // };

  return (
    <PageContainer>
      <Spacer height={20} />

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
    </PageContainer>
  );
}

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
