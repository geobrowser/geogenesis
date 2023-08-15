import { PersonalHomeJoinRequestCard } from './personal-home-join-request-card';
import { Request } from './types';

interface Props {
  requests: Request[];
}

export function PersonalHomeRequestsFeed({ requests }: Props) {
  return (
    <div className="flex flex-col my-4 gap-3">
      {requests.map((request, idx) => (
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
