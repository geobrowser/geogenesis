import * as React from 'react';
import { useState } from 'react';

import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useTriples } from '~/modules/triple/use-triples';
import { Triple } from '../types';
import { PageContainer, PageNumberContainer } from './table/styles';
import { NextButton, PageNumber, PreviousButton } from './table/table-pagination';
import { TripleInput } from './triple-input';
import { TripleTable } from './triple-table';

interface Props {
  spaceId: string;
  initialTriples: Triple[];
}

export function Triples({ spaceId, initialTriples }: Props) {
  const [showPredefinedQueries, setShowPredefinedQueries] = useState(true);
  const tripleStore = useTriples();

  return (
    <PageContainer>
      <Spacer height={20} />

      <TripleInput />

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
    </PageContainer>
  );
}
