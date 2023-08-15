import { Request } from './types';

export function PersonalHomeJoinRequestCard({
  requestType,
  requesterName,
  requesterAvatarUrl,
  spaceName,
  spaceId,
}: Request) {
  return (
    <div className="flex flex-col border-02 border grey-02">
      <div>
        <span>{requesterName}</span>
      </div>
    </div>
  );
}
