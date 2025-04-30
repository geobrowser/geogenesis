import type { JsonValue } from '@bufbuild/protobuf';
import { Either, Schema } from 'effect';

import { EditPublishedEvent } from './parser';

export function parseOutputToEvent(output: JsonValue) {
  const eventsInBlock: EditPublishedEvent[] = [];
  const maybeEditPublishedEvent = Schema.decodeUnknownEither(EditPublishedEvent)(output);

  if (Either.isRight(maybeEditPublishedEvent)) {
    // Ignore the US law space for now
    // const editsPublished = maybeEditPublishedEvent.right.editsPublished.filter(
    //   e => e.daoAddress !== US_LAW_SPACE.daoAddress
    // );

    eventsInBlock.push({
      editsPublished: maybeEditPublishedEvent.right.editsPublished,
    });
  }

  return eventsInBlock;
}
