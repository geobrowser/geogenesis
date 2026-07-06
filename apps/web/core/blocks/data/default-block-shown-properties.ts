import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';

export const DEFAULT_BLOCK_SHOWN_PROPERTIES: { id: string; name: string }[] = [
  { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description' },
  { id: SCORE_SYSTEM_PROPERTY, name: 'Score' },
];
