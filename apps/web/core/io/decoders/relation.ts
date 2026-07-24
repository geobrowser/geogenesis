import { Either, Schema } from 'effect';

import { hasRelationTarget, RelationDtoLive } from '~/core/io/dto/relations';
import { Relation as RelationType } from '~/core/types';

import { Relation as RelationSchema } from '../schema';

export class RelationDecoder {
  static decode(data: unknown): RelationType | null {
    const decoded = Schema.decodeUnknownEither(RelationSchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    // Drop dangling relations (target entity deleted or out of the queried
    // space) — there's nothing to render, and the DTO dereferences `toEntity`.
    if (!hasRelationTarget(decoded.right)) {
      return null;
    }

    const result = RelationDtoLive(decoded.right);
    return result;
  }
}
