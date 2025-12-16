export const ZERO_WIDTH_SPACE = '\u200b';
export const ALL_SPACES_IMAGE = 'ipfs://QmQXJYrbJJZcukgkzk8C71nQL1V8ND9TQjrtP4sKWjYPFH';
export const DEFAULT_OPENGRAPH_IMAGE = 'https://www.geobrowser.io/static/geo-social-image-v2.png';
export const PLACEHOLDER_SPACE_IMAGE = '/placeholder.png';
export const DEFAULT_OPENGRAPH_DESCRIPTION =
  "Browse and organize the world's public knowledge and information in a decentralized way.";
export const IPFS_GATEWAY_PATH = 'https://upload.lighthouse.storage';
export const IPFS_GATEWAY_READ_PATH = `https://gateway.lighthouse.storage/ipfs/`;
export const PINATA_GATEWAY_READ_PATH = 'https://magenta-naval-crow-536.mypinata.cloud/files/';

export const RENDERABLE_TYPE_PROPERTY = '2316bbe1-c76f-4635-83f2-3e03b4f1fe46';

// Video type IDs
export const VIDEO_URL_PROPERTY = '33da2ef5-bd55-4e91-af97-3e082e431a13';
export const VIDEO_RENDERABLE_TYPE = '0fb6bbf0-2204-4db4-9f70-fa82c41570a4';
export const VIDEO_TYPE = 'd7a4817c-9795-405b-93e2-12df759c43f8';
export const VIDEO_BLOCK_TYPE = '809bc406-d0f3-4f3c-a8a1-aa265733c6ce';
export const RECORDINGS_PROPERTY = '35c737c3-ce5a-4f89-9c0b-a84538bd1e52';
export const DATA_TYPE_PROPERTY = '6d29d578-49bb-4959-baf7-2cc696b1671a';
export const VALUE_TYPE_PROPERTY = 'ee26ef23-f7f1-4eb6-b742-3b0fa38c1fd8';
export const IS_TYPE_PROPERTY = 'd2c1a101-14e3-464a-8272-f4e75b0f1407';
export const ROOT_SPACE = '2a98e6b4-3728-44a4-9b8e-02e15f0677c8';

export const GEO_LOCATION = '9cf5c1b0-15dc-451c-bfd2-97db64806aff';
export const FORMAT_PROPERTY = '396f8c72-dfd0-4b57-91ea-09c1b9321b2f';

export const PLACE = '783bc688-e65f-4e54-b67f-a5643d78345e';
export const ADDRESS = '5c6e72fb-8340-47c0-8281-8be159ecd495';
export const VENUE_PROPERTY = 'f28bbb6b-f4e8-465d-9de7-a09085e224b9';
export const ADDRESS_PROPERTY = '72ba2a0f-729d-4847-925d-f3b09d46bb66';
export const MAPBOX_PROPERTY = 'f9d8ff4e-52f1-4e73-b8f2-bbb31dce5465';
export const UNIT_PROPERTY = '11b06581-20d3-41ea-b570-2ef4ee0a4ffd';
export const DEFAULT_TIME_FORMAT = 'MMMM d, yyy';
export const DEFAULT_NUMBER_FORMAT = ',?';

export const UNICODE_LINK = 'https://unicode-org.github.io/icu/userguide/format_parse/numbers/skeletons.html';
export const GRC_20_SPECIFICATION_LINK =
  'https://github.com/graphprotocol/graph-improvement-proposals/blob/main/grcs/0020-knowledge-graph.md#52-number';

export const SUGGESTED_NUMBER_FORMATS = [
  {
    format: '%',
    label: '25%',
  },
  {
    format: '.00',
    label: '25.00',
  },
  {
    format: 'K',
    label: '25K',
  },
  {
    format: DEFAULT_NUMBER_FORMAT,
    label: '25,000',
  },
];

export const SUGGESTED_TIME_FORMATS = [
  {
    format: 'h:mmaaa, MMMM d, yyyy',
    label: '4:45pm, July 4,2024',
  },
  {
    format: 'MM/dd/yy',
    label: '07/04/24',
  },
  {
    format: 'h:mmaa',
    label: '4:45pm',
  },
  {
    format: DEFAULT_TIME_FORMAT,
    label: 'July 4, 2024',
  },
];
