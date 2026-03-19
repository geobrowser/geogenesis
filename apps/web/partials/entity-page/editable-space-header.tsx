'use client';

import * as React from 'react';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

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
import { Create } from '~/design-system/icons/create';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { SubspacesDialog } from '~/partials/space-page/subspaces-dialog';
import { SpaceTopicDialog } from '~/partials/space-page/space-topic-dialog';
import { SubtopicsDialog } from '~/partials/space-page/subtopics-dialog';
import { CreateNewVersionInSpace } from '~/partials/versions/create-new-version-in-space';

import { HistoryDiffSlideUp } from '../history/history-diff-slide-up';
import { HistoryEmpty } from '../history/history-empty';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { useEntityHistory } from '../history/use-entity-history';

type OverlayMode = 'closed' | 'menu' | 'creatingVersion' | 'spaceRelationships' | 'spaceTopic' | 'subtopics';

type OverlayAction =
  | { type: 'SET_MENU_OPEN'; open: boolean }
  | { type: 'OPEN_CREATE_IN_SPACE' }
  | { type: 'OPEN_SPACE_RELATIONSHIPS' }
  | { type: 'OPEN_SPACE_TOPIC' }
  | { type: 'OPEN_SUBTOPICS' }
  | { type: 'CLOSE_OVERLAYS' };

function overlayReducer(state: OverlayMode, action: OverlayAction): OverlayMode {
  switch (action.type) {
    case 'SET_MENU_OPEN':
      if (action.open) {
        return state === 'creatingVersion' ? state : 'menu';
      }

      return 'closed';
    case 'OPEN_CREATE_IN_SPACE':
      return 'creatingVersion';
    case 'OPEN_SPACE_RELATIONSHIPS':
      return 'spaceRelationships';
    case 'OPEN_SPACE_TOPIC':
      return 'spaceTopic';
    case 'OPEN_SUBTOPICS':
      return 'subtopics';
    case 'CLOSE_OVERLAYS':
      return 'closed';
  }
}

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
  const [overlayMode, dispatch] = React.useReducer(overlayReducer, 'closed');

  const isContextMenuOpen = overlayMode === 'menu' || overlayMode === 'creatingVersion';
  const isCreatingNewVersion = overlayMode === 'creatingVersion';
  const isSubtopicsOpen = overlayMode === 'subtopics';
  const isSubspacesOpen = overlayMode === 'spaceRelationships';
  const isSpaceTopicOpen = overlayMode === 'spaceTopic';

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
      dispatch({ type: 'CLOSE_OVERLAYS' });
    } catch {
      console.error('Failed to copy space ID in: ', spaceId);
    }
  };

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      dispatch({ type: 'CLOSE_OVERLAYS' });
    } catch {
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
              onOpenChange={open => dispatch({ type: 'SET_MENU_OPEN', open })}
              align="end"
              trigger={isContextMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
              className={cx(!isCreatingNewVersion ? 'max-w-[160px]' : 'max-w-[320px]')}
            >
              {isCreatingNewVersion && (
                <CreateNewVersionInSpace
                  entityId={entityId as EntityId}
                  entityName={name ?? ''}
                  sourceSpaceId={spaceId}
                  setIsCreatingNewVersion={value =>
                    dispatch({ type: value ? 'OPEN_CREATE_IN_SPACE' : 'CLOSE_OVERLAYS' })
                  }
                  onDone={() => {
                    dispatch({ type: 'CLOSE_OVERLAYS' });
                  }}
                />
              )}
              {!isCreatingNewVersion && (
                <>
                  <MenuItem onClick={onCopySpaceId}>
                    <p>Copy Space ID</p>
                  </MenuItem>
                  <MenuItem onClick={onCopyEntityId}>
                    <p>Copy Entity ID</p>
                  </MenuItem>
                  <MenuItem onClick={() => dispatch({ type: 'OPEN_CREATE_IN_SPACE' })}>
                    <p>Create in space</p>
                  </MenuItem>
                  <MenuItem href={NavUtils.toImport(spaceId)}>
                    <p>Import data</p>
                  </MenuItem>
                  {isEditing && (
                    <>
                      <MenuItem
                        onClick={() => {
                          dispatch({ type: 'OPEN_SPACE_TOPIC' });
                        }}
                      >
                        <p>Set topic</p>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          dispatch({ type: 'OPEN_SPACE_RELATIONSHIPS' });
                        }}
                      >
                        <p>Space relationships</p>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          dispatch({ type: 'OPEN_SUBTOPICS' });
                        }}
                      >
                        <p>Subtopics</p>
                      </MenuItem>
                    </>
                  )}
                  {addSubspaceComponent}
                </>
              )}
            </Menu>
          </div>
        )}
      </div>

      <HistoryDiffSlideUp selection={diffSelection} onClose={clearDiffSelection} />
      <SubspacesDialog
        open={isSubspacesOpen}
        onOpenChange={open => dispatch({ type: open ? 'OPEN_SPACE_RELATIONSHIPS' : 'CLOSE_OVERLAYS' })}
        spaceId={spaceId}
      />
      <SpaceTopicDialog
        open={isSpaceTopicOpen}
        onOpenChange={open => dispatch({ type: open ? 'OPEN_SPACE_TOPIC' : 'CLOSE_OVERLAYS' })}
        spaceId={spaceId}
      />
      <SubtopicsDialog
        open={isSubtopicsOpen}
        onOpenChange={open => dispatch({ type: open ? 'OPEN_SUBTOPICS' : 'CLOSE_OVERLAYS' })}
        spaceId={spaceId}
      />
    </>
  );
}
