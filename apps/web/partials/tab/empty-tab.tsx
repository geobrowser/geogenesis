'use client';

import { useRouter } from 'next/navigation';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { SmallButton } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';

type EmptyTabProps = {
  spaceId: string;
  children: ReactNode;
};

export const EmptyTab = ({ children }: EmptyTabProps) => {
  const [hasCreatedEntity, setHasCreatedEntity] = useState<boolean>(false);

  const handleCreateEntity = () => {
    setHasCreatedEntity(true);
  };

  if (!hasCreatedEntity) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-grey-01 p-6 text-center">
        <div>
          <img src="/empty-tab.png" alt="" className="h-auto w-[235px]" />
        </div>
        <div className="mt-6 text-smallTitle">Finish setting up this tab</div>
        <div className="mt-2 w-full max-w-[50ch] text-balance text-metadata">
          Every tab in Geo is an entity. Create this tab’s entity in the click of a button and start adding any content
          you or others might want to see.
        </div>
        <div className="mt-5">
          <SmallButton icon={<Plus />} onClick={handleCreateEntity}>
            Create
          </SmallButton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
