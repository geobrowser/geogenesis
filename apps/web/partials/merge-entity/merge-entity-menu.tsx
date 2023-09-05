'use client';

import * as React from 'react';

import { useMergeEntity } from '~/core/state/merge-entity-store';

import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

interface Props {
  entityId: string;
}

export function MergeEntityMenu({ entityId }: Props) {
  /*
  1. List possible entities:
    - Look at other patterns (such as autocomplete) for the UX for longer lists
      - starting with an entities list and will refine from there
    - useEntities hook?
    - Filter entities user has access to? 
  2. Show entity name + description
  3. Select entity to merge with -- copy the entityId (entityIdTo)
  4. Pass over the entityId that is the current selection from params (entityIdFrom)
  5. Open the merge entity modal and pass in the two entityIds
*/
  const { setIsMergeReviewOpen, setEntityIdOne, setEntityIdTwo } = useMergeEntity();
  return (
    <div className="flex flex-col gap-2 bg-white">
      <div className="flex flex-col gap-2 px-2 py-2">
        <Text variant="smallButton">Search for an entity to merge with</Text>
        <Input onChange={e => console.log(e.target.value)} placeholder="Search for an entity to merge with" />
      </div>
      {/* Entity list */}
      <div className="flex flex-col max-h-[300px] overflow-y-auto justify-between w-full">
        <button
          className="flex items-center gap-3 p-2 hover:bg-grey-01 focus:bg-grey-01 transition-colors duration-75 cursor-pointer"
          onClick={() => {
            setEntityIdOne(entityId);
            setEntityIdTwo('cc1ce551-5f65-4d1b-8488-8c07901a355f');
            setIsMergeReviewOpen(true);
          }}
        >
          Test entity
        </button>
      </div>
    </div>
  );
}
