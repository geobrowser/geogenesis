'use client';

import * as React from 'react';

import { useDiff } from '~/core/state/diff-store';

import { Button } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';

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
  // const [data, isLoading] = useChangesFromVersions(selectedVersion, previousVersion);

  return <div>Versions temporarily disabled</div>;

  //   if (isLoading) {
  //     return <div className="text-metadataMedium">Loading...</div>;
  //   }

  //   if (data === undefined) {
  //     console.log('data is undefined');
  //     return <div className="text-metadataMedium">No versions found.</div>;
  //   }

  //   const { changes, versions } = data;

  //   if (!versions.selected) {
  //     console.log('No selected version');
  //     return <div className="text-metadataMedium">No versions found.</div>;
  //   }

  //   const changedEntityIds = Object.keys(changes);

  //   // @TODO: Fix change count
  //   const selectedVersionChangeCount = 0;

  //   const selectedVersionLastEditedDate = versions.selected.createdAt * 1000;

  //   const selectedVersionFormattedLastEditedDate = new Date(selectedVersionLastEditedDate).toLocaleDateString(undefined, {
  //     day: '2-digit',
  //     month: 'short',
  //     year: 'numeric',
  //   });

  //   const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
  //     hour: '2-digit',
  //     minute: '2-digit',
  //     hour12: false,
  //   });

  //   let previousVersionChangeCount;
  //   let previousVersionFormattedLastEditedDate;
  //   let previousVersionLastEditedTime;

  //   if (versions.previous) {
  //     // @TODO: Fix change count
  //     previousVersionChangeCount = 0;

  //     previousVersionFormattedLastEditedDate = new Date(versions.previous.createdAt * 1000).toLocaleDateString(
  //       undefined,
  //       {
  //         day: '2-digit',
  //         month: 'short',
  //         year: 'numeric',
  //       }
  //     );

  //     previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
  //       hour: '2-digit',
  //       minute: '2-digit',
  //       hour12: false,
  //     });
  //   }

  //   return (
  //     <div className="relative flex flex-col gap-16">
  //       <div>
  //         <div className="flex gap-8">
  //           <div className="flex-1">
  //             <div className="text-body">Previous version</div>
  //             {versions.previous && (
  //               <>
  //                 <div className="text-mediumTitle">{versions.previous.name}</div>
  //                 <div className="mt-1 flex items-center gap-4">
  //                   <Link
  //                     href={versions.previous.createdBy.profileLink ? versions.previous.createdBy.profileLink : ''}
  //                     className="inline-flex items-center gap-1"
  //                     onClick={() => setIsCompareOpen(false)}
  //                   >
  //                     <div className="relative h-3 w-3 overflow-hidden rounded-full">
  //                       <Avatar
  //                         alt={`Avatar for ${versions.previous.createdBy.name ?? versions.previous.createdBy.id}`}
  //                         avatarUrl={versions.previous.createdBy.avatarUrl}
  //                         value={versions.previous.createdBy.name ?? versions.previous.createdBy.id}
  //                       />
  //                     </div>
  //                     <p className="text-smallButton">
  //                       {versions.previous.createdBy.name ?? formatShortAddress(versions.previous.createdBy.id)}
  //                     </p>
  //                   </Link>
  //                   <div>
  //                     <p className="text-smallButton">
  //                       {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
  //                       {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
  //                     </p>
  //                   </div>
  //                 </div>
  //               </>
  //             )}
  //           </div>
  //           <div className="flex-1">
  //             <div className="text-body">Selected version</div>
  //             <div className="text-mediumTitle">{versions.selected.name}</div>
  //             <div className="mt-1 flex items-center gap-4">
  //               <Link
  //                 href={versions.selected.createdBy.profileLink ? versions.selected.createdBy.profileLink : ''}
  //                 className="inline-flex items-center gap-1"
  //                 onClick={() => setIsCompareOpen(false)}
  //               >
  //                 <div className="relative h-3 w-3 overflow-hidden rounded-full">
  //                   <Avatar
  //                     alt={`Avatar for ${versions.selected.createdBy.name ?? versions.selected.createdBy.id}`}
  //                     avatarUrl={versions.selected.createdBy.avatarUrl}
  //                     value={versions.selected.createdBy.name ?? versions.selected.createdBy.id}
  //                   />
  //                 </div>
  //                 <p className="text-smallButton">
  //                   {versions.selected.createdBy.name ?? formatShortAddress(versions.selected.createdBy.id)}
  //                 </p>
  //               </Link>
  //               <div>
  //                 <p className="text-smallButton">
  //                   {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
  //                   {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
  //                 </p>
  //               </div>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //       <div className="flex flex-col gap-16 divide-y divide-grey-02">
  //         {changedEntityIds.map((entityId: EntityId) => (
  //           <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
  //         ))}
  //       </div>
  //     </div>
  //   );
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
