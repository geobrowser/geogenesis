export const ZERO_WIDTH_SPACE = '\u200b';
export const ALL_SPACES_IMAGE = 'ipfs://QmQXJYrbJJZcukgkzk8C71nQL1V8ND9TQjrtP4sKWjYPFH';
export const DEFAULT_OPENGRAPH_IMAGE = 'https://www.geobrowser.io/static/geo-social-image-v2.png';
export const PLACEHOLDER_SPACE_IMAGE = '/placeholder.png';
export const DEFAULT_OPENGRAPH_DESCRIPTION =
  "Browse and organize the world's public knowledge and information in a decentralized way.";
export const IPFS_GATEWAY_PATH = 'https://upload.lighthouse.storage';
export const IPFS_GATEWAY_READ_PATH = `https://gateway.lighthouse.storage/ipfs/`;
export const PINATA_GATEWAY_READ_PATH = 'https://magenta-naval-crow-536.mypinata.cloud/files/';

export const RENDERABLE_TYPE_PROPERTY = '2316bbe1c76f463583f23e03b4f1fe46';

// Video type IDs
export const VIDEO_URL_PROPERTY = '33da2ef5bd554e91af973e082e431a13';
export const VIDEO_RENDERABLE_TYPE = '0fb6bbf022044db49f70fa82c41570a4';
export const VIDEO_TYPE = 'd7a4817c9795405b93e212df759c43f8';
export const VIDEO_BLOCK_TYPE = '809bc406d0f34f3ca8a1aa265733c6ce';

// Video file types and upload constraints
export const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/webm',
  'video/x-flv',
];
export const VIDEO_ACCEPT = VALID_VIDEO_TYPES.join(',');
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export const DATA_TYPE_PROPERTY = '6d29d57849bb4959baf72cc696b1671a';
export const VALUE_TYPE_PROPERTY = 'ee26ef23f7f14eb6b7423b0fa38c1fd8';
export const IS_TYPE_PROPERTY = 'd2c1a10114e3464a8272f4e75b0f1407';
export const ROOT_SPACE = '655d6077dc49e1f90e8574dd57c3164e';

export const GEO_LOCATION = '9cf5c1b015dc451cbfd297db64806aff';
export const FORMAT_PROPERTY = '396f8c72dfd04b5791ea09c1b9321b2f';

export const PLACE = '783bc688e65f4e54b67fa5643d78345e';
export const ADDRESS = '5c6e72fb834047c082818be159ecd495';
export const VENUE_PROPERTY = 'f28bbb6bf4e8465d9de7a09085e224b9';
export const ADDRESS_PROPERTY = '72ba2a0f729d4847925df3b09d46bb66';
export const MAPBOX_PROPERTY = 'f9d8ff4e52f14e73b8f2bbb31dce5465';
export const UNIT_PROPERTY = '11b0658120d341eab5702ef4ee0a4ffd';
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
