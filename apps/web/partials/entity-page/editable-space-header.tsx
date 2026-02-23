'use client';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
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

import { HistoryDiffSlideUp } from '../history/history-diff-slide-up';
import { HistoryEmpty } from '../history/history-empty';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { useEntityHistory } from '../history/use-entity-history';

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
          <div className="grow">
            <PageStringField
              variant="mainPage"
              placeholder="Entity name..."
              value={name ?? ''}
              onChange={onNameChange}
            />
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
                  sourceSpaceId={spaceId}
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

      <HistoryDiffSlideUp selection={diffSelection} onClose={clearDiffSelection} />
    </>
  );
}
