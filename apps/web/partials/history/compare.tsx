'use client';

import pluralize from 'pluralize';

import * as React from 'react';

import { useVersionChanges } from '~/core/hooks/use-version-changes';
import { useDiff } from '~/core/state/diff-store';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { SlideUp } from '~/design-system/slide-up';

import { ChangedEntity } from '../diff/changed-entity';

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
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          {compareMode === 'versions' && <Versions />}
          {compareMode === 'proposals' && <Proposals />}
        </div>
      </div>
    </>
  );
};

const Versions = () => {
  const { selectedVersion, previousVersion, setIsCompareOpen } = useDiff();
  const [data, isLoading] = useVersionChanges({
    spaceId: undefined,
    afterVersionId: selectedVersion,
    beforeVersionId: previousVersion,
  });

  if (isLoading) {
    return <div className="text-metadataMedium">Loading...</div>;
  }

  if (data === undefined || data === null) {
    return <div className="text-metadataMedium">No versions found.</div>;
  }

  const { beforeVersion, afterVersion, changes } = data;

  // @TODO: Fix change count
  const selectedVersionChangeCount = 0;

  const selectedVersionLastEditedDate = afterVersion.createdAt * 1000;

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

  if (beforeVersion) {
    // @TODO: Fix change count
    previousVersionChangeCount = 0;

    previousVersionFormattedLastEditedDate = new Date(beforeVersion.createdAt * 1000).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

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
            {beforeVersion && (
              <>
                <div className="text-mediumTitle">{beforeVersion.name}</div>
                <div className="mt-1 flex items-center gap-4">
                  <PrefetchLink
                    href={beforeVersion.createdBy.profileLink ? beforeVersion.createdBy.profileLink : ''}
                    className="inline-flex items-center gap-1"
                    onClick={() => setIsCompareOpen(false)}
                  >
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar
                        alt={`Avatar for ${beforeVersion.createdBy.name ?? beforeVersion.createdBy.id}`}
                        avatarUrl={beforeVersion.createdBy.avatarUrl}
                        value={beforeVersion.createdBy.name ?? beforeVersion.createdBy.id}
                      />
                    </div>
                    <p className="text-smallButton">
                      {beforeVersion.createdBy.name ?? formatShortAddress(beforeVersion.createdBy.id)}
                    </p>
                  </PrefetchLink>
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
            <div className="text-mediumTitle">{afterVersion.name}</div>
            <div className="mt-1 flex items-center gap-4">
              <PrefetchLink
                href={afterVersion.createdBy.profileLink ? afterVersion.createdBy.profileLink : ''}
                className="inline-flex items-center gap-1"
                onClick={() => setIsCompareOpen(false)}
              >
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar
                    alt={`Avatar for ${afterVersion.createdBy.name ?? afterVersion.createdBy.id}`}
                    avatarUrl={afterVersion.createdBy.avatarUrl}
                    value={afterVersion.createdBy.name ?? afterVersion.createdBy.id}
                  />
                </div>
                <p className="text-smallButton">
                  {afterVersion.createdBy.name ?? formatShortAddress(afterVersion.createdBy.id)}
                </p>
              </PrefetchLink>
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
        {changes.map(change => (
          <ChangedEntity key={change.id} change={change} />
        ))}
      </div>
    </div>
  );
};

const Proposals = () => {
  const { selectedProposal, previousProposal, setIsCompareOpen } = useDiff();
  // const [data, isLoading] = useChangesFromProposals(selectedProposal, previousProposal);

  return <div>Proposals temporarily disabled</div>;

  // if (isLoading) {
  //   return <div className="text-metadataMedium">Loading...</div>;
  // }

  // if (data === undefined) {
  //   return <div className="text-metadataMedium">No proposals found.</div>;
  // }

  // const { changes, proposals } = data;

  // if (!proposals.selected) {
  //   return <div className="text-metadataMedium">No proposals found.</div>;
  // }

  // const changedEntityIds = Object.keys(changes);

  // let selectedVersionChangeCount = 0;

  // // @TODO: fix
  // // if (proposals.selected) {
  // //   const proposal: Proposal = proposals.selected;

  // //   selectedVersionChangeCount = proposal.proposedVersions.reduce<AppOp[]>(
  // //     (acc, version) => acc.concat(version.ops),
  // //     []
  // //   ).length;
  // // }

  // const selectedVersionFormattedLastEditedDate = new Date(proposals.selected.createdAt * 1000).toLocaleDateString(
  //   undefined,
  //   {
  //     day: '2-digit',
  //     month: 'short',
  //     year: 'numeric',
  //   }
  // );

  // const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
  //   hour: '2-digit',
  //   minute: '2-digit',
  //   hour12: false,
  // });

  // let previousVersionChangeCount;
  // let previousVersionFormattedLastEditedDate;
  // let previousVersionLastEditedTime;

  // if (proposals.previous) {
  //   // @TODO: fix
  //   // const proposal: Proposal = proposals.previous;
  //   // previousVersionChangeCount = proposal.proposedVersions.reduce<AppOp[]>(
  //   //   (acc, version) => acc.concat(version.ops),
  //   //   []
  //   // ).length;
  //   // previousVersionFormattedLastEditedDate = new Date(proposal.createdAt * 1000).toLocaleDateString(undefined, {
  //   //   day: '2-digit',
  //   //   month: 'short',
  //   //   year: 'numeric',
  //   // });
  //   // previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
  //   //   hour: '2-digit',
  //   //   minute: '2-digit',
  //   //   hour12: false,
  //   // });
  // }

  // return (
  //   <div className="relative flex flex-col gap-16">
  //     <div>
  //       <div className="flex gap-8">
  //         <div className="flex-1">
  //           <div className="text-body">Previous proposal</div>
  //           {proposals.previous && (
  //             <>
  //               <div className="text-mediumTitle">{proposals.previous.name}</div>
  //               <div className="mt-1 flex items-center gap-4">
  //                 <Link
  //                   href={proposals.previous.createdBy.profileLink ? proposals.previous.createdBy.profileLink : ''}
  //                   className="inline-flex items-center gap-1"
  //                   onClick={() => setIsCompareOpen(false)}
  //                 >
  //                   <div className="relative h-3 w-3 overflow-hidden rounded-full">
  //                     <Avatar
  //                       alt={`Avatar for ${proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}`}
  //                       avatarUrl={proposals.previous.createdBy.avatarUrl}
  //                       value={proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}
  //                     />
  //                   </div>
  //                   <p className="text-smallButton">
  //                     {proposals.previous.createdBy.name ?? formatShortAddress(proposals.previous.createdBy.id)}
  //                   </p>
  //                 </Link>
  //                 <div>
  //                   <p className="text-smallButton">
  //                     {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
  //                     {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
  //                   </p>
  //                 </div>
  //               </div>
  //             </>
  //           )}
  //         </div>
  //         <div className="flex-1">
  //           <div className="text-body">Selected proposal</div>
  //           <div className="text-mediumTitle">{proposals.selected.name}</div>
  //           <div className="mt-1 flex items-center gap-4">
  //             <Link
  //               href={proposals.selected.createdBy.profileLink ? proposals.selected.createdBy.profileLink : ''}
  //               className="inline-flex items-center gap-1"
  //               onClick={() => setIsCompareOpen(false)}
  //             >
  //               <div className="relative h-3 w-3 overflow-hidden rounded-full">
  //                 <Avatar
  //                   alt={`Avatar for ${proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}`}
  //                   avatarUrl={proposals.selected.createdBy.avatarUrl}
  //                   value={proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}
  //                 />
  //               </div>
  //               <p className="text-smallButton">
  //                 {proposals.selected.createdBy.name ?? formatShortAddress(proposals.selected.createdBy.id)}
  //               </p>
  //             </Link>
  //             <div>
  //               <p className="text-smallButton">
  //                 {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
  //                 {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
  //               </p>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //     <div className="flex flex-col gap-16 divide-y divide-grey-02">
  //       {changedEntityIds.map((entityId: EntityId) => (
  //         <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
  //       ))}
  //     </div>
  //   </div>
  // );
};
