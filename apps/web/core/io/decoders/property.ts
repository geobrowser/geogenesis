import { Either, Schema } from 'effect';

import { Property } from '~/core/types';

import { PropertyDto } from '../dto/properties';
import { Property as PropertySchema } from '../schema';

export class PropertyDecoder {
  static decode(data: unknown): Property | null {
    const decoded = Schema.decodeUnknownEither(PropertySchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    const result = PropertyDto(decoded.right);
    return result;
  }
}
