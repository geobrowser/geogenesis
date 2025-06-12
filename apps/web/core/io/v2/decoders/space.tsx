import { Either, Schema } from 'effect';

import { Space, SpaceDto } from '../../dto/spaces';
import { Space as SpaceSchema } from '../v2.schema';

export class SpaceDecoder {
  static decode(data: unknown): Space | null {
    const decoded = Schema.decodeUnknownEither(SpaceSchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    return SpaceDto(decoded.right);
  }
}
