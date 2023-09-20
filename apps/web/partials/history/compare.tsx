'use client';

import { useQuery } from '@tanstack/react-query';
import pluralize from 'pluralize';

import * as React from 'react';

import { Services } from '~/core/services';
import { EntityId } from '~/core/state/actions-store';
import { useDiff } from '~/core/state/diff-store/diff-store';
import { Action } from '~/core/utils/action';
import { Change } from '~/core/utils/change';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';

import { ChangedEntity } from './changed-entity';
import { ProposalDiff, useChangesFromProposals } from './proposal-diff';

export const Compare = () => {
  const { isCompareOpen, setIsCompareOpen } = useDiff();

  return (
    <SlideUp isOpen={isCompareOpen} setIsOpen={setIsCompareOpen}>
      <CompareChanges />
    </SlideUp>
  );
};

const CompareChanges = () => {
  const { compareMode, setIsCompareOpen } = useDiff();

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">Compare {compareMode}</div>
        <div>
          <Button variant="secondary" onClick={() => setIsCompareOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[32px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          {compareMode === 'versions' && <Versions />}
          {compareMode === 'proposals' && <Proposals />}
        </div>
      </div>
    </>
  );
};

const Proposals = () => {
  const { selectedProposal, previousProposal } = useDiff();
  const [data, isLoading] = useChangesFromProposals(selectedProposal, previousProposal);

  if (isLoading) {
    return <div className="text-metadataMedium">Loading...</div>;
  }

  if (data === undefined) {
    return <div className="text-metadataMedium">No proposals found.</div>;
  }

  return <ProposalDiff proposalChangeset={data} />;
};

const Versions = () => {
  const { selectedVersion, previousVersion } = useDiff();
  const [data, isLoading] = useChangesFromVersions(selectedVersion, previousVersion);

  if (isLoading) {
    return <div className="text-metadataMedium">Loading...</div>;
  }

  if (data === undefined) {
    return <div className="text-metadataMedium">No versions found.</div>;
  }

  const { changes, versions } = data;

  if (!versions.selected) {
    return <div className="text-metadataMedium">No versions found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  const selectedVersionChangeCount = Action.getChangeCount(versions.selected.actions);

  const selectedVersionLastEditedDate = versions.selected.createdAt * 1000;

  const selectedVersionFormattedLastEditedDate = new Date(selectedVersionLastEditedDate).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let previousVersionChangeCount;
  let previousVersionFormattedLastEditedDate;
  let previousVersionLastEditedTime;

  if (versions.previous) {
    previousVersionChangeCount = Action.getChangeCount(versions.previous.actions);

    previousVersionFormattedLastEditedDate = new Date(versions.previous.createdAt * 1000).toLocaleDateString(
      undefined,
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

    previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <div className="relative flex flex-col gap-16">
      <div>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="text-body">Previous version</div>
            {versions.previous && (
              <>
                <div className="text-mediumTitle">{versions.previous.name}</div>
                <div className="mt-1 flex items-center gap-4">
                  <div className="inline-flex items-center gap-1">
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar
                        alt={`Avatar for ${versions.previous.createdBy.name ?? versions.previous.createdBy.id}`}
                        avatarUrl={versions.previous.createdBy.avatarUrl}
                        value={versions.previous.createdBy.name ?? versions.previous.createdBy.id}
                      />
                    </div>
                    <p className="text-smallButton">
                      {versions.previous.createdBy.name ?? formatShortAddress(versions.previous.createdBy.id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-smallButton">
                      {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
                      {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="text-body">Selected version</div>
            <div className="text-mediumTitle">{versions.selected.name}</div>
            <div className="mt-1 flex items-center gap-4">
              <div className="inline-flex items-center gap-1">
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar
                    alt={`Avatar for ${versions.selected.createdBy.name ?? versions.selected.createdBy.id}`}
                    avatarUrl={versions.selected.createdBy.avatarUrl}
                    value={versions.selected.createdBy.name ?? versions.selected.createdBy.id}
                  />
                </div>
                <p className="text-smallButton">
                  {versions.selected.createdBy.name ?? formatShortAddress(versions.selected.createdBy.id)}
                </p>
              </div>
              <div>
                <p className="text-smallButton">
                  {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
                  {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-16 divide-y divide-grey-02">
        {changedEntityIds.map((entityId: EntityId) => (
          <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
        ))}
      </div>
    </div>
  );
};

const useChangesFromVersions = (selectedVersion: string, previousVersion: string) => {
  const { subgraph, config } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${selectedVersion}-changes-from-${previousVersion}`],
    queryFn: async () => Change.fromVersion(selectedVersion, previousVersion, subgraph, config),
  });

  // Typescript thinks is an array
  return [data, isLoading] as const;
};
