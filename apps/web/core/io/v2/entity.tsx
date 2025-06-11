import { Either, Schema } from 'effect';

import { Entity as GraphqlEntity } from '~/core/gql/graphql';
import { Entity as EntityType } from '~/core/v2.types';

import { EntityDtoLive } from '../dto/entities';
import { Entity as EntitySchema, EntityType as EntityTypeSchema } from './v2.schema';

export class EntityDecoder {
  static decode(data: GraphqlEntity | null | undefined): EntityType | null {
    if (!data) {
      return null;
    }

    const decoded = Schema.decodeUnknownEither(EntitySchema)(data);

    if (Either.isLeft(decoded)) {
      console.error(
        'data.values',
        data.relations.map(r => r?.to)
      );
      console.error('Could not decode entity', data.id);
      return null;
    }

    return EntityDtoLive(decoded.right);
  }
}

export class EntityTypeDecoder {
  static decode(data: unknown): { id: string; name: string | null } {
    return Schema.decodeUnknownSync(EntityTypeSchema)(data);
  }
}
