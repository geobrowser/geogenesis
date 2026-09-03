'use client';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Create } from '~/design-system/icons/create';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { HistoryDiffSlideUp } from '../history/history-diff-slide-up';
import { HistoryEmpty } from '../history/history-empty';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { useEntityHistory } from '../history/use-entity-history';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { EntityVoteButtons } from './entity-vote-buttons';

interface EntityPageActionsProps {
  entityId: string;
  spaceId: string;
  isVoteable?: boolean;
}

/** Menu, history, mobile create, and votes — separate from type metadata */
export function EntityPageActions({ entityId, spaceId, isVoteable = false }: EntityPageActionsProps) {
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const editable = useUserIsEditing(spaceId);
  const name = useName(entityId);

  const {
    allVersions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    diffSelection,
    onVersionClick,
    clearDiffSelection,
  } = useEntityHistory({ entityId, spaceId, enabled: isHistoryOpen });

  return (
    <div className="ml-auto flex shrink-0 items-center gap-5">
      <EntityPageContextMenu entityId={entityId} entityName={name || ''} spaceId={spaceId} />
      <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        {!isFetching && allVersions.length === 0 && <HistoryEmpty />}
        {allVersions.map((v, index) => (
          <EntityVersionItem
            key={v.editId}
            createdAt={v.createdAt}
            name={v.name}
            createdById={v.createdById}
            createdBy={v.createdBy}
            onClick={() => {
              onVersionClick(v, index);
              setIsHistoryOpen(false);
            }}
          />
        ))}
        {isFetching && allVersions.length === 0 && (
          <div className="flex h-12 w-full items-center justify-center bg-white">
            <Dots />
          </div>
        )}
        {hasNextPage && (
          <div className="flex h-12 w-full shrink-0 items-center justify-center bg-white">
            {isFetchingNextPage ? (
              <Dots />
            ) : (
              <SmallButton variant="secondary" onClick={() => fetchNextPage()}>
                Show more
              </SmallButton>
            )}
          </div>
        )}
      </HistoryPanel>
      {editable && (
        <Link
          href={NavUtils.toEntity(spaceId, ID.createEntityId())}
          className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
        >
          <Create />
        </Link>
      )}
      {isVoteable && <EntityVoteButtons entityId={entityId} spaceId={spaceId} />}
      <HistoryDiffSlideUp selection={diffSelection} onClose={clearDiffSelection} />
    </div>
  );
}
