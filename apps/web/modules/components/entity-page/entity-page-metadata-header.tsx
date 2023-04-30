import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { EntityType } from '~/modules/types';
import { HistoryItem, HistoryLoading, HistoryPanel } from '../history';
import { EntityPageTypeChip } from './entity-page-type-chip';
import { Action } from '~/modules/action';
import { useQuery } from '@tanstack/react-query';
import { Services } from '~/modules/services';
import { HistoryEmpty } from '../history/history-empty';
import { Menu } from '~/modules/design-system/menu';
import { Context } from '~/modules/design-system/icons/context';
import { Close } from '~/modules/design-system/icons/close';
import { Text } from '~/modules/design-system/text';
import { Action as IAction } from '~/modules/types';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
  types: Array<EntityType>;
}

export function EntityPageMetadataHeader({ id, spaceId, types }: EntityPageMetadataHeaderProps) {
  const { network } = Services.useServices();
  const { data: versions, isLoading } = useQuery({
    queryKey: [`entity-versions-for-entityId-${id}`],
    queryFn: async () => network.fetchProposedVersions(id, spaceId),
  });

  const isLoadingVersions = !versions || isLoading;

  return (
    <div className="flex items-center justify-between text-text">
      <ul className="flex items-center gap-1">
        {types.map(t => (
          <li key={t.id}>
            <EntityPageTypeChip type={t} />
          </li>
        ))}
      </ul>

      <HistoryPanel isLoading={isLoadingVersions} isEmpty={versions?.length === 0}>
        {versions?.map(v => (
          <HistoryItem
            key={v.id}
            changeCount={Action.getChangeCount(v.actions)}
            createdAt={v.createdAt}
            createdBy={v.createdBy}
            name={v.name}
          />
        ))}
      </HistoryPanel>
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

  const { data: proposals, isLoading } = useQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: async () => network.fetchProposals(spaceId),
  });

  const isLoadingProposals = !proposals || isLoading;

  return (
    <div className="flex items-center justify-between text-text">
      <div className="flex"></div>
      <div className="inline-flex items-center gap-4">
        <HistoryPanel isLoading={isLoadingProposals} isEmpty={proposals?.length === 0}>
          {proposals?.map(p => (
            <HistoryItem
              key={p.id}
              changeCount={Action.getChangeCount(
                p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
              )}
              createdAt={p.createdAt}
              createdBy={p.createdBy}
              name={p.name}
            />
          ))}
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
