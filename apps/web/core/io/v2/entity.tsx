import { Schema } from 'effect';

import { Entity as EntityType } from '~/core/v2.types';

import { EntityDtoLive } from '../dto/entities';
import { Entity as EntitySchema, EntityType as EntityTypeSchema } from './v2.schema';

export class EntityDecoder {
  static decode(data: unknown): EntityType {
    const decoded = Schema.decodeUnknownSync(EntitySchema)(data);

    return EntityDtoLive(decoded);
  }
}

export class EntityTypeDecoder {
  static decode(data: unknown): { id: string; name: string | null } {
    return Schema.decodeUnknownSync(EntityTypeSchema)(data);
  }
}
