import { Schema } from 'effect';

import { Entity as EntityType } from '~/core/v2.types';

import { EntityDtoLive } from '../dto/entities';
import { Entity as EntitySchema } from './v2.schema';

export class EntityDecoder {
  static decode(data: unknown): EntityType {
    const decoded = Schema.decodeUnknownSync(EntitySchema)(data);

    return EntityDtoLive(decoded);
  }
}
