import { motion } from 'framer-motion';
import { Dropdown } from '~/modules/design-system/dropdown';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
// import { importCSVFile } from '~/modules/services/import';
import { useTriples } from '~/modules/state/use-triples';
import { EntityNames, Triple } from '../../types';
// import { getFilesFromFileList } from '../utils';
import styled from '@emotion/styled';
import { useState } from 'react';
import { PageContainer, PageNumberContainer } from '../table/styles';
import { NextButton, PageNumber, PreviousButton } from '../table/table-pagination';
import { EntitiesTable } from './entities-table';
import { EntityInput } from './entity-input';

const EntityFilterBar = styled.div({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  width: '100%',
});

const TypeSelect = styled.div({
  marginRight: '16px',
});

interface Props {
  spaceId: string;
  spaceName?: string;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
  types: Triple[];
}

export function Entities({ spaceId, initialEntityNames, initialTriples, types }: Props) {
  const [selectedType, setSelectedType] = useState<Triple>(types[0]);

  const tripleStore = useTriples();
  const typeOptions = types.map(type => {
    return {
      label: type.entityName,
      value: type.entityId,
      onClick: () => {
        setSelectedType(type);
      },
      disabled: false,
    };
  });
  return (
    <PageContainer>
      <Spacer height={20} />

      <motion.div style={{ maxWidth: '100%' }} layout="position" transition={{ duration: 0.1 }}>
        <EntityFilterBar>
          <TypeSelect>
            <Dropdown trigger={selectedType.entityName} options={typeOptions} />
          </TypeSelect>

          <EntityInput />
        </EntityFilterBar>

        <Spacer height={12} />

        <EntitiesTable
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
