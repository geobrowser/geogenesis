import { ID } from '~/core/id';

export const mockPeople = [
  {
    id: ID.createEntityId(),
    name: 'Alice',
    avatarUrl: 'https://i.pravatar.cc/64?img=2',
  },
  {
    id: ID.createEntityId(),
    name: 'Bob',
    avatarUrl: 'https://i.pravatar.cc/64?img=4',
  },
  {
    id: ID.createEntityId(),
    name: 'Charlie',
    avatarUrl: 'https://i.pravatar.cc/64?img=3',
  },
];
