import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useInfiniteQuery } from '@tanstack/react-query';

import { EntityType } from '~/modules/types';
import { HistoryEmpty, HistoryItem, HistoryPanel } from '../history';
import { EntityPageTypeChip } from './entity-page-type-chip';
import { Action } from '~/modules/action';
import { Services } from '~/modules/services';
import { Menu } from '~/modules/design-system/menu';
import { Context } from '~/modules/design-system/icons/context';
import { Close } from '~/modules/design-system/icons/close';
import { Text } from '~/modules/design-system/text';
import { Action as IAction } from '~/modules/types';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { useDiff } from '~/modules/diff';
import { Dots } from '~/modules/design-system/dots';
import { SmallButton } from '~/modules/design-system/button';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
  types: Array<EntityType>;
}

export function EntityPageMetadataHeader({ id, spaceId, types }: EntityPageMetadataHeaderProps) {
  const { network } = Services.useServices();
  const {
    data: versions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`entity-versions-for-entityId-${id}`],
    queryFn: async ({ pageParam = 0 }) => network.fetchProposedVersions(id, spaceId, undefined, pageParam),
    getNextPageParam: (_lastPage, pages) => pages.length,
  });

  const { setCompareMode, setSelectedVersion, setPreviousVersion, setIsCompareOpen } = useDiff();

  const isOnePage = versions?.pages && versions.pages[0].length < 10;

  const isLastPage =
    versions?.pages &&
    versions.pages.length > 1 &&
    versions.pages[versions.pages.length - 1]?.[0]?.id === versions.pages[versions.pages.length - 2]?.[0]?.id;

  const renderedVersions = !isLastPage ? versions?.pages : versions?.pages.slice(0, -1);

  const showMore = !isOnePage && !isLastPage;

  return (
    <div className="flex items-center justify-between text-text">
      <ul className="flex items-center gap-1">
        {types.map(t => (
          <li key={t.id}>
            <EntityPageTypeChip type={t} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <HistoryPanel>
          {versions?.pages?.length === 0 && <HistoryEmpty />}
          {renderedVersions?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map((v, index) => (
                <HistoryItem
                  key={v.id}
                  onClick={() => {
                    setCompareMode('versions');
                    setPreviousVersion(group[index + 1]?.id ?? '');
                    setSelectedVersion(v.id);
                    setIsCompareOpen(true);
                  }}
                  changeCount={Action.getChangeCount(v.actions)}
                  createdAt={v.createdAt}
                  createdBy={v.createdBy}
                  name={v.name}
                />
              ))}
            </React.Fragment>
          ))}
          {showMore && (
            <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
              {isFetching || isFetchingNextPage ? (
                <Dots />
              ) : (
                <SmallButton variant="secondary" onClick={() => fetchNextPage()}>
                  Show more
                </SmallButton>
              )}
            </div>
          )}
        </HistoryPanel>
        <EntityPageContextMenu entityId={id} spaceId={spaceId} />
      </div>
    </div>
  );
}

interface SpacePageMetadataHeaderProps {
  spaceId: string;
}

export function SpacePageMetadataHeader({ spaceId }: SpacePageMetadataHeaderProps) {
  const [open, onOpenChange] = React.useState(false);
  const router = useRouter();

  const { network } = Services.useServices();

  const {
    data: proposals,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: async ({ pageParam = 0 }) => network.fetchProposals(spaceId, undefined, pageParam),
    getNextPageParam: (_lastPage, pages) => pages.length,
  });

  const { setCompareMode, setSelectedProposal, setPreviousProposal, setIsCompareOpen } = useDiff();

  const isOnePage = proposals?.pages && proposals.pages[0].length < 10;

  const isLastPage =
    proposals?.pages &&
    proposals.pages.length > 1 &&
    proposals.pages[proposals.pages.length - 1]?.[0]?.id === proposals.pages[proposals.pages.length - 2]?.[0]?.id;

  const renderedProposals = !isLastPage ? proposals?.pages : proposals?.pages.slice(0, -1);

  const showMore = !isOnePage && !isLastPage;

  return (
    <div className="flex items-center justify-between text-text">
      <div className="flex">
        <span className="mt-1 inline-block rounded bg-text px-[7px] py-px text-sm font-medium text-white">Space</span>
      </div>
      <div className="inline-flex items-center gap-4">
        <HistoryPanel>
          {proposals?.pages?.length === 0 && <HistoryEmpty />}
          {renderedProposals?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map((p, index) => (
                <HistoryItem
                  key={p.id}
                  onClick={() => {
                    setCompareMode('proposals');
                    setPreviousProposal(group[index + 1]?.id ?? '');
                    setSelectedProposal(p.id);
                    setIsCompareOpen(true);
                  }}
                  changeCount={Action.getChangeCount(
                    p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
                  )}
                  createdAt={p.createdAt}
                  createdBy={p.createdBy}
                  name={p.name}
                />
              ))}
            </React.Fragment>
          ))}
          {showMore && (
            <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
              {isFetching || isFetchingNextPage ? (
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
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
          className="max-w-[5.8rem] whitespace-nowrap"
        >
          <Link href={`${router.asPath}/entities`}>
            <a className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg">
              <Text variant="button" className="hover:!text-text">
                View data
              </Text>
            </a>
          </Link>
        </Menu>
      </div>
    </div>
  );
}
