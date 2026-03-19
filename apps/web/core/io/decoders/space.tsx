import { Either, Schema } from 'effect';

import { Space, SpaceDto } from '../dto/spaces';
import { Entity as EntitySchema, type RemoteEntity, type RemoteSpace, Space as SpaceSchema } from '../schema';

function decodeTopic(data: unknown, spaceId: string, topicId: string | null): RemoteEntity | null {
  if (data == null) {
    return null;
  }

  const decoded = Schema.decodeUnknownEither(EntitySchema)(data);

  if (Either.isLeft(decoded)) {
    console.warn('Failed decoding Space topic, falling back to page', {
      spaceId,
      topicId,
      error: decoded.left,
    });

    return null;
  }

  return decoded.right;
}

export class SpaceDecoder {
  static decode(data: unknown): Space | null {
    const decoded = Schema.decodeUnknownEither(SpaceSchema)(data);

    if (Either.isLeft(decoded)) {
      console.error('Failed decoding Space', decoded.left);
      // @TODO: Error handling when decoding
      return null;
    }

    const remoteSpace: RemoteSpace = {
      ...decoded.right,
      topic: decodeTopic(decoded.right.topic, decoded.right.id, decoded.right.topicId ?? null),
    };

    return SpaceDto(remoteSpace);
  }
}
