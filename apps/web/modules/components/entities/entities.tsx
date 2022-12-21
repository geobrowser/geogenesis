import { motion } from 'framer-motion';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
// import { importCSVFile } from '~/modules/services/import';
import { Column, Row } from '../../types';
// import { getFilesFromFileList } from '../utils';
import { useTables } from '~/modules/state/use-tables';
import { PageContainer, PageNumberContainer } from '../table/styles';
import { NextButton, PageNumber, PreviousButton } from '../table/table-pagination';
import { EntitiesTable } from './entities-table';
import { EntityInput } from './entity-input';

interface Props {
  spaceId: string;
  spaceName?: string;
  initialRows: Row[];
  initialColumns: Column[];
}

export function Entities({ spaceId, initialColumns, initialRows }: Props) {
  const tableStore = useTables();

  return (
    <PageContainer>
      <Spacer height={20} />

      <motion.div style={{ maxWidth: '100%' }} layout="position" transition={{ duration: 0.1 }}>
        <EntityInput />
        <Spacer height={12} />

        <EntitiesTable
          space={spaceId}
          columns={tableStore.columns.length === 0 ? initialColumns : tableStore.columns}
          rows={tableStore.rows.length === 0 ? initialRows : tableStore.rows}
        />

        <Spacer height={12} />

        <PageNumberContainer>
          {tableStore.pageNumber > 1 && (
            <>
              <PageNumber number={1} onClick={() => tableStore.setPageNumber(0)} />
              {tableStore.pageNumber > 2 ? (
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
          {tableStore.hasPreviousPage && (
            <>
              <PageNumber number={tableStore.pageNumber} onClick={tableStore.setPreviousPage} />
              <Spacer width={4} />
            </>
          )}
          <PageNumber isActive number={tableStore.pageNumber + 1} />
          {tableStore.hasNextPage && (
            <>
              <Spacer width={4} />
              <PageNumber number={tableStore.pageNumber + 2} onClick={tableStore.setNextPage} />
            </>
          )}
          <Spacer width={32} />
          <PreviousButton isDisabled={!tableStore.hasPreviousPage} onClick={tableStore.setPreviousPage} />
          <Spacer width={12} />
          <NextButton isDisabled={!tableStore.hasNextPage} onClick={tableStore.setNextPage} />
        </PageNumberContainer>
      </motion.div>
    </PageContainer>
  );
}
