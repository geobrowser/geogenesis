import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import type { Property } from '~/core/types';

export const DEFAULT_BLOCK_SHOWN_PROPERTIES: { id: string; name: string }[] = [
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description' },
  { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
  { id: SCORE_SYSTEM_PROPERTY, name: 'Score' },
];

export const DEFAULT_BLOCK_MENU_PROPERTIES: readonly Property[] = [
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
  { id: SystemIds.TYPES_PROPERTY, name: 'Types', dataType: 'RELATION' },
  { id: SCORE_SYSTEM_PROPERTY, name: 'Score', dataType: 'INTEGER' },
];
