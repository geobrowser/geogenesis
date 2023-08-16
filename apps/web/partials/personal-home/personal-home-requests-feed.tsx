import { PersonalHomeJoinRequestCard } from './personal-home-join-request-card';
import { PersonalHomeRequest } from './types';

interface Props {
  requests: PersonalHomeRequest[];
}

export function PersonalHomeRequestsFeed({ requests }: Props) {
  return (
    <div className="flex flex-col my-4 gap-3 h-screen overflow-y-auto overscroll-contain">
      {requests?.map((request, idx) => (
        <PersonalHomeJoinRequestCard
          key={idx}
          requestType={request.requestType}
          requesterName={request.requesterName}
          spaceName={request.spaceName}
        />
      ))}
    </div>
  );
}
