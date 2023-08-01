import { makeStubTriple } from '~/core/io/mocks/mock-network';

const AVATARS = [
  'https://images.unsplash.com/photo-1615266895738-11f1371cd7e5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3269&q=80',
  'https://images.unsplash.com/photo-1608096299210-db7e38487075?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3269&q=80',
  'https://images.unsplash.com/photo-1620336655055-088d06e36bf0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1374&q=80',
];

const COVERS = [
  'https://images.unsplash.com/photo-1620121692029-d088224ddc74?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3732&q=80',
  'https://images.unsplash.com/photo-1620503374956-c942862f0372?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3270&q=80',
  'https://images.unsplash.com/photo-1584968124544-d10ce10dd21f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3271&q=80',
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2748&q=80',
];

const NAMES = ['John Snow'];

const RANDOM_NAME = NAMES[Math.floor(Math.random() * NAMES.length)];
const RANDOM_AVATAR = AVATARS[Math.floor(Math.random() * AVATARS.length)];
const RANDOM_COVER = COVERS[Math.floor(Math.random() * COVERS.length)];

export const MOCK_PROFILE = {
  id: '0x123',
  name: RANDOM_NAME,
  avatarUrl: RANDOM_AVATAR,
  coverUrl: RANDOM_COVER,
  spaceId: '0x123',
  referencedByEntities: [],
  triples: [makeStubTriple(RANDOM_NAME)],
};
