'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { useState } from 'react';

import { useBulkPublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Space } from '~/core/io/dto/spaces';
import { Entities } from '~/core/utils/entity';

import { SlideUp } from '~/design-system/slide-up';

import { actionsCountAtom, entityCountAtom, entityCountByTypeAtom, publishAtom, stepAtom, triplesAtom } from './atoms';

type PublishProps = {
  spaceId: string;
  space: Space;
};

export const Publish = ({ spaceId, space }: PublishProps) => {
  const [isPublishOpen, setIsPublishOpen] = useAtom(publishAtom);

  return (
    <SlideUp isOpen={isPublishOpen} setIsOpen={setIsPublishOpen}>
      <PublishImport spaceId={spaceId} space={space} />
    </SlideUp>
  );
};

type PublishImportProps = {
  spaceId: string;
  space: Space;
};

const PublishImport = ({ spaceId, space }: PublishImportProps) => {
  const triples = useAtomValue(triplesAtom);
  const actionsCount = useAtomValue(actionsCountAtom);
  const entityCount = useAtomValue(entityCountAtom);
  const entityCountByType = useAtomValue(entityCountByTypeAtom);
  const setStep = useSetAtom(stepAtom);
  const setIsPublishOpen = useSetAtom(publishAtom);

  const spaceName = Entities.name(space?.spaceConfig?.triples ?? []);
  const spaceAvatar = Entities.avatar(space?.spaceConfig?.relationsOut);

  const [proposalName, setProposalName] = useState('');
  const isReadyToPublish = proposalName.length > 3;
  const { smartAccount } = useSmartAccount();
  const { makeBulkProposal } = useBulkPublish();

  const handlePublish = async () => {
    if (!smartAccount) {
      return;
    }

    await makeBulkProposal({
      triples: triples,
      relations: [],
      spaceId,
      name: proposalName,
      onSuccess: () => {
        setStep('done');
        setIsPublishOpen(false);
      },
    });
  };

  // @TODO: fix
  return null;

  // const [data, isLoading] = useLocalChanges(triples.slice(0, 150), spaceId);

  // if (isLoading || !data) {
  //   return null;
  // }

  // const { changes } = data;
  // const exampleEntityIds = Object.keys(changes).slice(0, 3);

  // return (
  //   <>
  //     <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
  //       <div className="inline-flex items-center gap-4">
  //         <SquareButton onClick={() => setIsPublishOpen(false)} icon={<Close />} />
  //         <div className="inline-flex items-center gap-2">
  //           <span className="text-metadataMedium leading-none">Review your CSV import into</span>
  //           <span className="inline-flex items-center gap-2 text-button text-text">
  //             {spaceAvatar ? (
  //               <span className="relative h-4 w-4 overflow-hidden rounded-sm">
  //                 <img
  //                   src={getImagePath(spaceAvatar)}
  //                   className="absolute inset-0 h-full w-full object-cover object-center"
  //                   alt=""
  //                 />
  //               </span>
  //             ) : null}
  //             <span>{spaceName ?? ''}</span>
  //           </span>
  //         </div>
  //       </div>
  //       <div>
  //         <Button onClick={handlePublish} disabled={!isReadyToPublish}>
  //           Publish
  //         </Button>
  //       </div>
  //     </div>
  //     <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
  //       <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
  //         <div className="relative flex flex-col gap-16">
  //           <div className="flex flex-col">
  //             <div className="text-body">Proposal name</div>
  //             <input
  //               type="text"
  //               value={proposalName}
  //               onChange={({ currentTarget: { value } }) => setProposalName(value)}
  //               placeholder="Name your proposal..."
  //               className="bg-transparent text-3xl font-semibold text-text placeholder:text-grey-02 focus:outline-none"
  //             />
  //           </div>
  //           <div className="flex gap-10">
  //             <div className="flex w-3/4 flex-col divide-y divide-grey-02 rounded-lg bg-grey-01 p-10">
  //               <div className="pb-8">
  //                 <div className="flex items-center gap-2 text-bodySemibold">
  //                   <span>
  //                     <Warning />
  //                   </span>
  //                   <span>You’re about to propose a significant amount of edits.</span>
  //                 </div>
  //                 <div className="text-body">
  //                   You can publish this proposal, but if you want to check all of your edits manually, you need to
  //                   review them in your CSV file. Make changes there and restart the import if necessary.
  //                 </div>
  //               </div>
  //               <div className="pt-8">
  //                 <div className="text-metadataMedium">Entity count by type</div>
  //                 <div className="mt-4 flex gap-4">
  //                   {entityCountByType.map((item, index) => (
  //                     <div
  //                       key={index}
  //                       className="flex items-center gap-1.5 rounded-sm bg-white px-2 py-1 text-breadcrumb"
  //                     >
  //                       <div>{item.name}</div>
  //                       <span>·</span>
  //                       <div>{item.count}</div>
  //                     </div>
  //                   ))}
  //                 </div>
  //               </div>
  //             </div>
  //             <div className="flex w-1/4 flex-col items-center justify-center divide-y divide-grey-02 rounded-lg bg-grey-01 p-10">
  //               <div className="flex w-full flex-col items-center justify-center pb-5">
  //                 <div className="text-smallTitle">Total edits</div>
  //                 <div className="text-largeTitle">{actionsCount}</div>
  //               </div>
  //               <div className="flex w-full flex-col items-center justify-center pt-5">
  //                 <div className="text-smallTitle">Total entities</div>
  //                 <div className="text-largeTitle">{entityCount}</div>
  //               </div>
  //             </div>
  //           </div>
  //           <div className="relative">
  //             <div className="flex flex-col gap-16 divide-y divide-grey-02">
  //               {/* @TODO: diffs not implemented */}
  //               {/* {exampleEntityIds.map((entityId: string) => (
  //                 <NewEntity key={entityId} change={changes[entityId]} />
  //               ))} */}
  //             </div>
  //             <div className="absolute bottom-0 left-0 right-0 z-10 h-1/2 bg-gradient-to-b from-transparent via-bg/75 to-bg"></div>
  //             <div className="absolute bottom-16 left-0 right-0 z-20">
  //               <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-grey-01 p-5 text-bodySemibold">
  //                 <span>
  //                   <Warning />
  //                 </span>
  //                 <span>To view all edits, please consult your CSV file.</span>
  //               </div>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   </>
  // );
};
