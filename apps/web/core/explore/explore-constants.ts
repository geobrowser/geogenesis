/** Entity types shown on Explore (Geo ontology IDs, hyphenless for GraphQL variables). */
export const EXPLORE_ENTITY_TYPES = [
  { id: 'e550fe517e904b2c8fffdf13408f5634', label: 'News story' },
  { id: '972d201ad78045689e01543f67b26bee', label: 'Episode' },
  { id: 'f3d4461486b74d2583d89709c9d84f65', label: 'Post' },
  { id: 'd6f0506def324d8e9de4976b986e78ec', label: 'Tweet' },
  { id: '4d876b81787e41fcab5d075d4da66a3f', label: 'Event' },
  { id: '5e24fb52856c4189a9716af4387b1b89', label: 'Paper' },
  { id: '7ed45f2bc48b419e8e4664d5ff680b0d', label: 'Person' },
  { id: '484a18c5030a499cb0f2ef588ff16d50', label: 'Project' },
  { id: '150db6defe2344f0805afa57502e2c32', label: 'Ranking block' },
  { id: '0419ca20118b4cdb84dfdb9ed73b50c2', label: 'Community call event' },
  { id: 'fd51f93520634617be397b672b23364c', label: 'Debate' },
] as const;

export const EXPLORE_ENTITY_TYPE_IDS = EXPLORE_ENTITY_TYPES.map(type => type.id);

export const EXPLORE_ENTITY_NAME_PROPERTY_ID = 'a126ca530c8e48d5b88882c734c38935';
export const EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID = '9b1f76ff9711404c861e59dc3fa7d037';
export const EXPLORE_COVER_PROPERTY_ID = '34f535072e6b42c5a84443981a77cfa2';
export const EXPLORE_AVATAR_PROPERTY_ID = '1155befffad549b7a2e0da4777b8792c';

export const EXPLORE_PAGE_SIZE = 22;
