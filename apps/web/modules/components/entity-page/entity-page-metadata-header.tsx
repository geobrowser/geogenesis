import { EntityType } from '~/modules/types';
import { HistoryItem, HistoryLoading, HistoryPanel } from '../history';
import { EntityPageTypeChip } from './entity-page-type-chip';
import { Action } from '~/modules/action';
import { useQuery } from '@tanstack/react-query';
import { Services } from '~/modules/services';
import { ResizableContainer } from '~/modules/design-system/resizable-container';

interface Props {
  id: string;
  spaceId: string;
  types: Array<EntityType>;
}

export function EntityPageMetadataHeader({ id, spaceId, types }: Props) {
  const { network } = Services.useServices();
  const {
    data: versions,
    isLoading,
    error,
  } = useQuery({
    queryKey: [`entity-versions-for-entityId-${id}`],
    queryFn: async () => network.fetchProposedVersions(id, spaceId),
  });

  const isLoadingVersions = !versions || isLoading || error;

  return (
    <div className="flex items-center justify-between text-text">
      <ul className="flex items-center gap-1">
        {types.map(t => (
          <li key={t.id}>
            <EntityPageTypeChip type={t} />
          </li>
        ))}
      </ul>

      <HistoryPanel>
        {isLoadingVersions ? (
          <HistoryLoading />
        ) : (
          versions.map(v => (
            <HistoryItem
              key={v.id}
              changeCount={Action.getChangeCount(v.actions)}
              createdAt={v.createdAt}
              createdBy={v.createdBy}
              name={v.name}
            />
          ))
        )}
      </HistoryPanel>
    </div>
  );
}
