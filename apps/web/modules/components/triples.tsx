import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useTriples } from '~/modules/triple/use-triples';
import { ZERO_WIDTH_SPACE } from '../constants';
import { IconButton } from '../design-system/button';
import { Triple } from '../types';
import { PREDEFINED_QUERIES } from './data/predefined-queries';
import { PredefinedQueriesContainer } from './predefined-queries/container';
import { PageContainer, PageNumberContainer } from './table/styles';
import { NextButton, PageNumber, PreviousButton } from './table/table-pagination';
import { FilterIconContainer, TableSearchInput } from './table/table-search';
import { TripleTable } from './triple-table';

const PresetIconContainer = styled(FilterIconContainer)<{ showPredefinedQueries: boolean }>(props => ({
  cursor: 'pointer',
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  backgroundColor: props.showPredefinedQueries ? props.theme.colors['grey-01'] : props.theme.colors.white,
  borderLeft: 'none',
  transition: 'colors 0.15s ease-in-out',
  color: props.theme.colors['grey-04'],

  '&:hover': {
    color: props.theme.colors.text,
    backgroundColor: props.theme.colors['grey-01'],
  },

  button: {
    padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,
    color: props.showPredefinedQueries ? props.theme.colors.text : props.theme.colors['grey-04'],

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

interface Props {
  spaceId: string;
  spaceName?: string;
  initialTriples: Triple[];
}

export function Triples({ spaceId, initialTriples, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const [showPredefinedQueries, setShowPredefinedQueries] = useState(true);
  const tripleStore = useTriples();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

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

      <motion.div ref={inputContainerRef} style={{ maxWidth: '100%' }} layout="position" transition={{ duration: 0.1 }}>
        <TableSearchInput
          query={tripleStore.query}
          onQueryChange={tripleStore.setQuery}
          onFilterStateChange={tripleStore.setFilterState}
          filterState={tripleStore.filterState}
          inputContainerWidth={inputRect?.width}
          predefinedQueryTrigger={
            <PresetIconContainer showPredefinedQueries={showPredefinedQueries}>
              <IconButton
                aria-label="predefined-queries-button"
                onClick={() => setShowPredefinedQueries(!showPredefinedQueries)}
                icon="preset"
              />
            </PresetIconContainer>
          }
        />

        <Spacer height={12} />

        <TripleTable space={spaceId} triples={tripleStore.hydrated ? tripleStore.triples : initialTriples} />

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
