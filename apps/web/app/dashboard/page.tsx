import { PersonalHomeHeader } from '~/partials/personal-home/personal-home-header';
import { PersonalHomeSidebar } from '~/partials/personal-home/personal-home-sidebar';

import { PersonalHomeRequestsFeed } from '../../partials/personal-home/personal-home-requests-feed';

// currently the route is /dashboard while scaffolding
// originally had it as /dashboard/[userAddress] but thinking we'd use that for public profiles

const mockJoinProps = [
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
];

export default function PersonalSpace() {
  return (
    <div className="flex flex-col mx-28 h-screen mb-8">
      <PersonalHomeHeader />
      <div className="grid grid-cols-4 w-full gap-8 overflow-hidden">
        <div className="col-span-3 flex-1 overflow-y-scroll">
          <PersonalHomeRequestsFeed requests={mockJoinProps} />
        </div>
        <div className="col-span-1">
          <PersonalHomeSidebar />
        </div>
      </div>
    </div>
  );
}
