import { useAccessControl } from '~/modules/auth/use-access-control';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useEntityTable } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { Column, Row } from '../../types';
import { EntityOthersToast } from '../entity/presence/entity-others-toast';
import { EntityPresenceProvider } from '../entity/presence/entity-presence-provider';
import { PageContainer, PageNumberContainer } from '../table/styles';
import { NextButton, PageNumber, PreviousButton } from '../table/table-pagination';
import { EntityInput } from './entity-input';
import { EntityTable } from './entity-table';
import { EntityTableErrorBoundary } from './entity-table-error-boundary';

interface Props {
  spaceId: string;
  spaceName?: string;
  initialRows: Row[];
  initialColumns: Column[];
}

export function EntityTableContainer({ spaceId, initialColumns, initialRows }: Props) {
  const entityTableStore = useEntityTable();
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();

  return (
    <EntityTableErrorBoundary spaceId={spaceId} typeId={entityTableStore.selectedType?.entityId ?? ''}>
      <PageContainer>
        <Spacer height={20} />

        <EntityInput spaceId={spaceId} />
        <Spacer height={12} />

        {/* 
        Using a container to wrap the table to make styling borders around
        the table easier. Otherwise we need to do some pseudoselector shenanigans
        or use box-shadow instead of border.
      */}
        <div className="p-0 border border-grey-02 rounded overflow-hidden">
          <EntityTable
            space={spaceId}
            columns={entityTableStore.hydrated ? entityTableStore.columns : initialColumns}
            rows={entityTableStore.hydrated ? entityTableStore.rows : initialRows}
          />
        </div>

        <Spacer height={12} />

        <PageNumberContainer>
          {entityTableStore.pageNumber > 1 && (
            <>
              <PageNumber number={1} onClick={() => entityTableStore.setPageNumber(0)} />
              {entityTableStore.pageNumber > 2 ? (
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
          {entityTableStore.hasPreviousPage && (
            <>
              <PageNumber number={entityTableStore.pageNumber} onClick={entityTableStore.setPreviousPage} />
              <Spacer width={4} />
            </>
          )}
          <PageNumber isActive number={entityTableStore.pageNumber + 1} />
          {entityTableStore.hasNextPage && (
            <>
              <Spacer width={4} />
              <PageNumber number={entityTableStore.pageNumber + 2} onClick={entityTableStore.setNextPage} />
            </>
          )}
          <Spacer width={32} />
          <PreviousButton isDisabled={!entityTableStore.hasPreviousPage} onClick={entityTableStore.setPreviousPage} />
          <Spacer width={12} />
          <NextButton isDisabled={!entityTableStore.hasNextPage} onClick={entityTableStore.setNextPage} />
        </PageNumberContainer>
      </PageContainer>
      {isEditor && editable && (
        <EntityPresenceProvider entityId={entityTableStore.selectedType?.entityId ?? ''} spaceId={spaceId}>
          <EntityOthersToast />
        </EntityPresenceProvider>
      )}
    </EntityTableErrorBoundary>
  );
}
