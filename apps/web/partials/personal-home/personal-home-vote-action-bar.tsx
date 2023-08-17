import { IconButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { Vote } from './types';

interface Props {
  votes: Vote[];
}

export function PersonalHomeVoteActionBar({ votes }: Props) {
  return (
    <div className="flex flex-row w-full mt-4 items-center justify-between">
      <div className="flex flex-row items-center gap-2">
        <div className="w-3 h-3 bg-purple rounded-sm" />
        <Text variant="breadcrumb" color="grey-04">
          {spaceName}
        </Text>
      </div>
      <div className="flex flex-row gap-2">
        <IconButton icon="close" className="border border-grey-02 rounded-sm p-2" />
        <IconButton icon="tick" className="border border-grey-02 rounded-sm p-2" />
      </div>
    </div>
  );
}
