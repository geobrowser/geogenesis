import { Either, Schema } from 'effect';

import { Entity as EntityType } from '~/core/v2.types';

import { EntityDtoLive } from '../../dto/entities';
import { Entity as EntitySchema, EntityType as EntityTypeSchema } from '../v2.schema';

export class EntityDecoder {
  static decode(data: unknown): EntityType | null {
    const decoded = Schema.decodeUnknownEither(EntitySchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    const result = EntityDtoLive(decoded.right);
    return result;
  }
}

export class EntityTypeDecoder {
  static decode(data: unknown): { id: string; name: string | null } | null {
    const decoded = Schema.decodeUnknownEither(EntityTypeSchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    return decoded.right;
  }
}
