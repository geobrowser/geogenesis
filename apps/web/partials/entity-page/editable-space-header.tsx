'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import cx from 'classnames';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { fetchEntityVersions, type EntityVersion } from '~/core/io/subgraph/fetch-entity-versions';
import { EntityId } from '~/core/io/substream-schema';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Create } from '~/design-system/icons/create';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { CreateNewVersionInSpace } from '~/partials/versions/create-new-version-in-space';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryDiffSlideUp, type HistoryDiffSelection } from '../history/history-diff-slide-up';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';

const PAGE_SIZE = 10;

export function EditableSpaceHeading({
  spaceId,
  entityId,
  addSubspaceComponent,
}: {
  spaceId: string;
  entityId: string;
  addSubspaceComponent?: React.ReactElement<any>;
}) {
  const name = useName(entityId, spaceId);
  const isEditing = useUserIsEditing(spaceId);

  const path = usePathname();
  const isSpacePage = path === `/space/${spaceId}`;

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const [isCreatingNewVersion, setIsCreatingNewVersion] = React.useState<boolean>(false);
  const [diffSelection, setDiffSelection] = React.useState<HistoryDiffSelection | null>(null);

  const {
    data: versionPages,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    enabled: isHistoryOpen,
    initialPageParam: 0,
    queryKey: [`space-versions-rest-${entityId}`],
    queryFn: ({ signal, pageParam = 0 }) =>
      fetchEntityVersions({ entityId, limit: PAGE_SIZE, offset: pageParam * PAGE_SIZE, signal }),
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
  });

  const allVersions = React.useMemo(() => versionPages?.pages.flat() ?? [], [versionPages]);

  const onVersionClick = (version: EntityVersion, index: number) => {
    const nextVersion = allVersions[index + 1];
    if (!nextVersion) return;

    const date = new Date(version.createdAt);
    const dateLabel = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const label = version.name ?? `Changes from ${dateLabel}`;

    setDiffSelection({
      entityId,
      spaceId,
      fromEditId: nextVersion.editId,
      toEditId: version.editId,
      label,
    });
    setIsHistoryOpen(false);
  };

  const onCopySpaceId = async () => {
    try {
      await navigator.clipboard.writeText(spaceId);
      setIsContextMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy space ID in: ', spaceId);
    }
  };

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsContextMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const { storage } = useMutate();

  const onNameChange = (value: string) => {
    storage.entities.name.set(entityId, spaceId, value);
  };

  return (
    <>
      <div className="relative flex items-center justify-between">
        {isEditing ? (
          <div className="flex-grow">
            <PageStringField variant="mainPage" placeholder="Entity name..." value={name ?? ''} onChange={onNameChange} />
            {/* Manual spacing to match the <Text /> height and avoid layout shift */}
            <Spacer height={3.5} />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <Truncate maxLines={3} shouldTruncate>
                <Text as="h1" variant="mainPage">
                  {name ?? ZERO_WIDTH_SPACE}
                </Text>
              </Truncate>
            </div>
            <Spacer height={12} />
          </div>
        )}
        {isSpacePage && (
          <div className="inline-flex items-center gap-4">
            {isEditing && (
              <Link
                href={NavUtils.toEntity(spaceId, ID.createEntityId())}
                className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
              >
                <Create />
              </Link>
            )}
            <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              {!isFetching && allVersions.length === 0 && <HistoryEmpty />}
              {allVersions.length <= 1 && allVersions.length > 0 && !isFetching && <HistoryEmpty />}
              {allVersions.length > 1 &&
                allVersions.map((v, index) => {
                  if (index === allVersions.length - 1) return null;
                  return (
                    <EntityVersionItem
                      key={v.editId}
                      createdAt={v.createdAt}
                      name={v.name}
                      createdBy={v.createdBy}
                      isFirst={index === 0}
                      onClick={() => onVersionClick(v, index)}
                    />
                  );
                })}
              {isFetching && allVersions.length === 0 && (
                <div className="flex h-12 w-full items-center justify-center bg-white">
                  <Dots />
                </div>
              )}
              {hasNextPage && (
                <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
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
            <Menu
              open={isContextMenuOpen}
              onOpenChange={setIsContextMenuOpen}
              align="end"
              trigger={isContextMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
              className={cx(!isCreatingNewVersion ? 'max-w-[160px]' : 'max-w-[320px]')}
            >
              {isCreatingNewVersion && (
                <CreateNewVersionInSpace
                  entityId={entityId as EntityId}
                  entityName={name ?? ''}
                  setIsCreatingNewVersion={setIsCreatingNewVersion}
                  onDone={() => {
                    setIsContextMenuOpen(false);
                  }}
                />
              )}
              {!isCreatingNewVersion && (
                <>
                  <MenuItem onClick={onCopySpaceId}>
                    <Copy color="grey-04" />
                    <p>Copy Space ID</p>
                  </MenuItem>
                  <MenuItem onClick={onCopyEntityId}>
                    <Copy color="grey-04" />
                    <p>Copy Entity ID</p>
                  </MenuItem>
                  <MenuItem onClick={() => setIsCreatingNewVersion(true)}>
                    <div className="shrink-0">
                      <MoveSpace />
                    </div>
                    <p>Create in space</p>
                  </MenuItem>
                  {addSubspaceComponent}
                </>
              )}
            </Menu>
          </div>
        )}
      </div>

      <HistoryDiffSlideUp selection={diffSelection} onClose={() => setDiffSelection(null)} />
    </>
  );
}
