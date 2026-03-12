export const ZERO_WIDTH_SPACE = '\u200b';
export const ALL_SPACES_IMAGE = 'ipfs://QmQXJYrbJJZcukgkzk8C71nQL1V8ND9TQjrtP4sKWjYPFH';
export const PLACEHOLDER_SPACE_IMAGE = '/placeholder.png';
export const IPFS_GATEWAY_PATH = 'https://upload.lighthouse.storage';
export const IPFS_GATEWAY_READ_PATH = `https://gateway.lighthouse.storage/ipfs/`;
export const PINATA_GATEWAY_READ_PATH = 'https://magenta-naval-crow-536.mypinata.cloud/files/';

export const RENDERABLE_TYPE_PROPERTY = '2316bbe1c76f463583f23e03b4f1fe46';

export const VIDEO_RENDERABLE_TYPE = '0fb6bbf022044db49f70fa82c41570a4';

// Bounty linking - relation type used to link proposals to bounties
export const BOUNTIES_RELATION_TYPE = '3b4c516ff3ac41e0a939374119a27d6e';
export const BOUNTY_TYPE_ID = '808af0bad5884e3391f09dd4b25e18be';
export const BOUNTY_DESCRIPTION_PROPERTY_ID = '9b1f76ff9711404c861e59dc3fa7d037';
export const BOUNTY_BUDGET_PROPERTY_ID = '9ece325c592d42d5b2e785e8e6fe05b6';
export const BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID = '1d7bb89ec2854df7afac28cec9007e38';
export const BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID = '21c06b6d7f7846f1ac65e4fc4eadc615';
export const BOUNTY_DIFFICULTY_PROPERTY_ID = '8c8405abc6bc4d46a5806e4fc80d8187';
export const BOUNTY_STATUS_PROPERTY_ID = 'f54a81632f4c44a8a6a5d7b97ec0370e';
export const BOUNTY_DEADLINE_PROPERTY_ID = '7566286ca054405a83e185ffd60492fb';
export const BOUNTY_ALLOCATED_PROPERTY_ID = 'cfeb642223c54df4b3f9375a489d9e22';
export const PROPOSAL_TYPE_ID = '490a7c90ad4b4029b2b4d85d22fe203a';

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

// Image file types and upload constraints
export const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const IMAGE_ACCEPT = VALID_IMAGE_TYPES.join(',');
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const DATA_TYPE_PROPERTY = '6d29d57849bb4959baf72cc696b1671a';

/** DataType → entity ID for Data Type relations. */
export const DATA_TYPE_ENTITY_IDS: Record<string, string> = {
  TEXT: '9edb6fcce4544aa5861139d7f024c010',
  RELATION: '4b6d9fc1fbfe474c861c83398e1b50d9',
  BOOLEAN: '7aa4792eeacd41868272fa7fc18298ac',
  INTEGER: '149fd752d9d04f80820d1d942eea7841',
  FLOAT: '9b597aaec31c46c88565a370da0c2a65',
  DECIMAL: 'a3288c22a0564f6fb409fbcccb2c118c',
  BYTES: '66b433247667496899b48a89bd1de22b',
  DATE: 'e661d10292794449a22367dbae1be05a',
  TIME: 'ad75102b03c04d59903813ede9482742',
  DATETIME: '167664f668f840e1976b20bd16ed8d47',
  SCHEDULE: 'caf4dd12ba4844b99171aff6c1313b50',
  POINT: 'df250d17e364413d97792ddaae841e34',
  EMBEDDING: 'f732849378ba4577a33fac5f1c964f18',
};
export const VALUE_TYPE_PROPERTY = 'ee26ef23f7f14eb6b7423b0fa38c1fd8';
export const IS_TYPE_PROPERTY = 'd2c1a10114e3464a8272f4e75b0f1407';

export const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';

export const GEO_LOCATION = '9cf5c1b015dc451cbfd297db64806aff';
export const FORMAT_PROPERTY = '396f8c72dfd04b5791ea09c1b9321b2f';

export const PLACE = '783bc688e65f4e54b67fa5643d78345e';
export const ADDRESS = '5c6e72fb834047c082818be159ecd495';
export const VENUE_PROPERTY = 'f28bbb6bf4e8465d9de7a09085e224b9';
export const ADDRESS_PROPERTY = '72ba2a0f729d4847925df3b09d46bb66';
export const MAPBOX_PROPERTY = 'f9d8ff4e52f14e73b8f2bbb31dce5465';
export const UNIT_PROPERTY = '11b0658120d341eab5702ef4ee0a4ffd';
export const DEFAULT_DATE_FORMAT = 'MMMM d, yyyy';
export const DEFAULT_DATETIME_FORMAT = 'h:mmaaa, MMMM d, yyyy';
export const DEFAULT_TIME_FORMAT = 'h:mmaaa';
export const DEFAULT_FLOAT_FORMAT = '.0000';
export const DEFAULT_NUMBER_FORMAT = ',?';
export const DEFAULT_URL_TEMPLATE = '';

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

export const SUGGESTED_FLOAT_FORMATS = [
  {
    format: DEFAULT_FLOAT_FORMAT,
    label: '1,000.0000',
  },
  {
    format: '.000',
    label: '1.000,0000',
  },
  {
    format: ',000',
    label: '1,000.0000',
  },
];

export const SUGGESTED_DATE_FORMATS = [
  {
    format: DEFAULT_DATE_FORMAT,
    label: 'July 4, 2024',
  },
  {
    format: 'MM/dd/yy',
    label: '07/04/24',
  },
  {
    format: 'yyyy-MM-dd',
    label: '2024-07-04',
  },
  {
    format: 'dd/MM/yyyy',
    label: '04/07/2024',
  },
];

export const SUGGESTED_DATETIME_FORMATS = [
  {
    format: DEFAULT_DATETIME_FORMAT,
    label: '4:45pm, July 4, 2024',
  },
  {
    format: 'MM/dd/yy h:mmaaa',
    label: '07/04/24 4:45pm',
  },
  {
    format: 'yyyy-MM-dd HH:mm',
    label: '2024-07-04 16:45',
  },
  {
    format: DEFAULT_DATE_FORMAT,
    label: 'July 4, 2024',
  },
];

export const SUGGESTED_TIME_FORMATS = [
  {
    format: DEFAULT_TIME_FORMAT,
    label: '4:45pm',
  },
  {
    format: 'HH:mm',
    label: '16:45',
  },
  {
    format: 'HH:mm:ss',
    label: '16:45:30',
  },
  {
    format: 'h:mm:ssaaa',
    label: '4:45:30pm',
  },
];

export const SUGGESTED_URL_FORMATS = [
  {
    format: 'https://x.com/{value}',
    label: 'Twitter',
  },
  {
    format: 'https://github.com/{value}',
    label: 'GitHub',
  },
  {
    format: 'https://instagram.com/{value}',
    label: 'Instagram',
  },
  {
    format: 'https://www.linkedin.com/in/{value}',
    label: 'LinkedIn',
  },
  {
    format: 'https://www.youtube.com/@{value}',
    label: 'YouTube',
  },
  {
    format: 'https://etherscan.io/address/{value}',
    label: 'Etherscan',
  },
  {
    format: 'https://t.me/{value}',
    label: 'Telegram',
  },
  {
    format: 'https://discord.gg/{value}',
    label: 'Discord',
  },
  {
    format: 'https://open.spotify.com/artist/{value}',
    label: 'Spotify Artist',
  },
  {
    format: 'https://en.wikipedia.org/wiki/{value}',
    label: 'Wikipedia',
  },
];
