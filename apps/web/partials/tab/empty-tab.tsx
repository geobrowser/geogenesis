'use client';

import { useRouter } from 'next/navigation';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';

type EmptyTabProps = {
  spaceId: string;
  children: ReactNode;
};

export const EmptyTab = ({ spaceId, children }: EmptyTabProps) => {
  const isEditing = useUserIsEditing(spaceId);
  const [hasCreatedEntity, setHasCreatedEntity] = useState<boolean>(false);

  const handleCreateEntity = () => {
    setHasCreatedEntity(true);
  };

  const router = useRouter();

  useEffect(() => {
    if (!isEditing) {
      router.push(NavUtils.toSpace(spaceId));
    }
  }, [isEditing, router, spaceId]);

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
