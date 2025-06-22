import { Either, Schema } from 'effect';

import { Property as PropertyType } from '~/core/v2.types';

import { PropertyDtoLive } from '../../dto/properties';

// Define a schema that matches what the propertyQuery actually returns
const PropertyQueryResult = Schema.Struct({
  id: Schema.String,
  dataType: Schema.String,
  renderableType: Schema.NullOr(Schema.String),
});

export class PropertyDecoder {
  static decode(data: unknown): PropertyType | null {
    const decoded = Schema.decodeUnknownEither(PropertyQueryResult)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding
      return null;
    }

    const result = PropertyDtoLive(decoded.right);
    return result;
  }
}