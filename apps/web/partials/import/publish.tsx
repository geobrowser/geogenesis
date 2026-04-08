'use client';

import { useState } from 'react';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { useBulkPublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Space } from '~/core/io/dto/spaces';
import { Entities } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { SlideUp } from '~/design-system/slide-up';

import { actionsCountAtom, entityCountAtom, publishAtom, relationsAtom, valuesAtom } from './atoms';

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
  const router = useRouter();
  const values = useAtomValue(valuesAtom);
  const relations = useAtomValue(relationsAtom);
  const actionsCount = useAtomValue(actionsCountAtom);
  const entityCount = useAtomValue(entityCountAtom);
  const setIsPublishOpen = useSetAtom(publishAtom);
  const spaceName = Entities.name(space?.entity?.values ?? []);
  const spaceAvatar = Entities.avatar(space?.entity?.relations);
  const [proposalName, setProposalName] = useState('');
  const isReadyToPublish = proposalName.length > 0;
  const { smartAccount } = useSmartAccount();
  const { makeBulkProposal } = useBulkPublish();

  const handlePublish = async () => {
    if (!smartAccount) return;
    await makeBulkProposal({
      values,
      relations,
      spaceId,
      name: proposalName,
      onSuccess: () => {
        setIsPublishOpen(false);
        router.refresh();
      },
    });
  };

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsPublishOpen(false)} icon={<Close />} />
          <div className="inline-flex items-center gap-2">
            <span className="text-metadataMedium leading-none">Review your CSV import into</span>
            <span className="inline-flex items-center gap-2 text-button text-text">
              {spaceAvatar ? (
                <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                  <img
                    src={getImagePath(spaceAvatar)}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    alt=""
                  />
                </span>
              ) : null}
              <span>{spaceName ?? ''}</span>
            </span>
          </div>
        </div>
        <div>
          <Button onClick={handlePublish} disabled={!isReadyToPublish || values.length === 0}>
            Publish
          </Button>
        </div>
      </div>
      <div className="mt-3 overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg p-6 shadow-big">
        <div className="mx-auto max-w-[600px] space-y-6">
          <div>
            <div className="text-body">Proposal name</div>
            <input
              type="text"
              value={proposalName}
              onChange={({ currentTarget: { value } }) => setProposalName(value)}
              placeholder="Name your proposal..."
              className="mt-1 w-full rounded border border-grey-02 bg-white px-3 py-2 text-button text-text placeholder:text-grey-03 focus:ring-2 focus:ring-ctaPrimary focus:outline-hidden"
            />
          </div>
          <div className="flex gap-6 rounded-lg bg-grey-01 p-4">
            <div className="flex flex-col">
              <span className="text-metadataMedium">Total edits</span>
              <span className="text-largeTitle">{actionsCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-metadataMedium">Total entities</span>
              <span className="text-largeTitle">{entityCount}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
