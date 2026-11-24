'use client';

import * as React from 'react';

import cx from 'classnames';

import { markGraphExplorerEntry } from '~/core/graph-explorer/graph-share';
import { graphExplorerHref } from '~/core/graph-explorer/href';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { NetworkIcon } from '~/core/templates/primitives/icons';
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
  /** Tighten the action spacing when the row shares a compact header. */
  compact?: boolean;
  /** The entity's own primary action, ahead of the votes — a topic's Follow, which replaces them. */
  leading?: React.ReactNode;
  /**
   * `template`: the entity template header (GEO-3837). Version history moves into the "…" menu, and
   * a graph link takes the history icon's place while the `graphExplorer` flag is on.
   */
  variant?: 'page' | 'template';
}

/** Votes, create, history, and menu — separate from type metadata */
export function EntityPageActions({
  entityId,
  spaceId,
  isVoteable = false,
  compact = false,
  leading,
  variant = 'page',
}: EntityPageActionsProps) {
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const editable = useUserIsEditing(spaceId);
  const name = useName(entityId, spaceId);
  const graphExplorerEnabled = useFeatureFlag('graphExplorer');

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

  const versionList = (onPicked: () => void) => (
    <>
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
            onPicked();
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
    </>
  );

  const isTemplate = variant === 'template';

  return (
    <div className={cx('ml-auto flex shrink-0 items-center', compact ? 'gap-4' : 'gap-5')}>
      {leading}
      {isVoteable && <EntityVoteButtons entityId={entityId} spaceId={spaceId} showInlineError={!compact} />}
      {editable && (
        // The label keeps this icon-only link from announcing as its bare URL. `PrefetchLink`
        // matches the space header and includes hover prefetching.
        <Link
          href={NavUtils.toEntity(spaceId, ID.createEntityId())}
          aria-label="Create new entity"
          className="stroke-grey-04 transition-colors duration-75 hover:stroke-text mobile:hidden"
        >
          <Create />
        </Link>
      )}
      {isTemplate ? (
        graphExplorerEnabled && (
          <Link
            href={graphExplorerHref({ entityId, topicId: entityId, spaceId })}
            onClick={() => markGraphExplorerEntry('topic_page')}
            aria-label="Explore graph"
            title="Explore graph"
            data-geo-analytics-label="Explore graph"
            data-geo-analytics-intent="open_graph_explorer"
            className="inline-flex text-grey-04 transition-colors duration-75 hover:text-text"
          >
            <NetworkIcon className="size-4" />
          </Link>
        )
      ) : (
        <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {versionList(() => setIsHistoryOpen(false))}
        </HistoryPanel>
      )}
      <EntityPageContextMenu
        entityId={entityId}
        entityName={name || ''}
        spaceId={spaceId}
        versionHistory={isTemplate ? versionList : undefined}
        onVersionHistoryOpenChange={isTemplate ? setIsHistoryOpen : undefined}
      />
      <HistoryDiffSlideUp selection={diffSelection} onClose={clearDiffSelection} />
    </div>
  );
}
