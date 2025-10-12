import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useState } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { EntityId } from '~/core/io/schema';
import { getImagePath } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Input } from '~/design-system/input';

type CreateNewVersionInSpaceProps = {
  entityId: EntityId;
  entityName?: string;
  setIsCreatingNewVersion: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
};

export const CreateNewVersionInSpace = ({
  entityId,
  entityName,
  setIsCreatingNewVersion,
  onDone,
}: CreateNewVersionInSpaceProps) => {
  const router = useRouter();

  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const spaces = useSpacesWhereMember(address);

  const [query, setQuery] = useState<string>('');

  const renderedSpaces =
    query.length === 0
      ? spaces
      : spaces.filter(space => space?.entity?.name?.toLowerCase()?.includes(query.toLowerCase()));

  return (
    <div className="bg-white">
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsCreatingNewVersion(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-[4] p-2 text-center text-button text-text">Select space to create in</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="flex max-h-[190px] flex-col gap-1 overflow-auto p-1">
        {renderedSpaces.map(space => {
          return (
            <button
              key={space.id}
              onClick={() => {
                router.push(NavUtils.toEntity(space.id, entityId, true, entityName));
                onDone?.();
              }}
              className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01"
            >
              <div className="relative size-4 rounded bg-grey-01">
                <img
                  src={getImagePath(space.entity.image)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="text-button text-text">{space.entity.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
