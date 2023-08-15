import Avatar from 'boring-avatars';

import { Button } from '~/design-system/button';

import { PersonalHomeRequestActionBar } from './personal-home-request-action-bar';
import { Request } from './types';

export function PersonalHomeJoinRequestCard({
  requestType,
  requesterName,
  requesterAvatarUrl,
  spaceId,
  spaceName,
}: Request) {
  return (
    <div className="flex flex-col border border-grey-02 rounded grey-02 p-4">
      <div className="flex flex-row items-center w-full justify-between">
        <div className="flex flex-row items-center gap-4">
          <div className="relative rounded-sm overflow-hidden">
            <Avatar size={24} />
          </div>
          <span className="text-smallTitle text-text">{requesterName}</span>
        </div>
        <div>
          {requestType === 'member' ? <Button variant="tertiary">Member join request</Button> : null}
          {requestType === 'editor' ? <Button variant="tertiary">Editor join request</Button> : null}
        </div>
      </div>
      <PersonalHomeRequestActionBar spaceName={spaceName} />
    </div>
  );
}
