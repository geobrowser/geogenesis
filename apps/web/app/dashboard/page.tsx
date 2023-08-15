import { Component } from './component';

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

export default function PersonalHomePage() {
  return <Component requests={mockJoinProps} />;
}
