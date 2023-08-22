import { Avatar } from '~/design-system/avatar';
import { Icon } from '~/design-system/icon';
import { Text } from '~/design-system/text';

import { PersonalHomeRequestActionBar } from './personal-home-request-action-bar';
import { PersonalHomeRequest } from './types';

// component for the icon + status - badge maybe?

const RequestBadge = ({ requestType }: Pick<PersonalHomeRequest, 'requestType'>) => {
  const iconType = requestType === 'member' ? 'member' : 'bulkEdit';
  const joinRequestType = requestType === 'member' ? 'Member join request' : 'Editor join request';
  return (
    <div className="flex flex-row items-center rounded-sm bg-grey-01 text-text gap-2 p-2">
      <Icon icon={iconType} />
      <span className="text-text text-sm font-medium text-weight-500">{joinRequestType}</span>
    </div>
  );
};

// rounded-[12px] -> rounded-xl (matche the figma) but rounded-xl token not working

export function PersonalHomeJoinRequestCard({
  requestType,
  requesterName,
  requesterAvatarUrl,
  spaceId,
  spaceName,
}: PersonalHomeRequest) {
  return (
    <div className="flex flex-col border border-grey-02 rounded grey-02 p-4 shadow-light">
      <div className="flex flex-row items-center w-full justify-between">
        <div className="flex flex-row items-center gap-4">
          <div className="relative rounded-sm overflow-hidden">
            <Avatar size={24} />
          </div>
          <Text variant="smallTitle">{requesterName}</Text>
        </div>
        <div>
          <RequestBadge requestType={requestType} />
        </div>
      </div>
      <PersonalHomeRequestActionBar spaceName={spaceName} />
    </div>
  );
}
