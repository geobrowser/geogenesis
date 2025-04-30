import type { JsonValue } from '@bufbuild/protobuf';
import { Either, Schema } from 'effect';

import { EditPublishedEvent } from './parser';
import { US_LAW_SPACE } from '~/sink/constants/constants';

export function parseOutputToEvent(output: JsonValue) {
  const eventsInBlock: EditPublishedEvent[] = [];
  const maybeEditPublishedEvent = Schema.decodeUnknownEither(EditPublishedEvent)(output);

  if (Either.isRight(maybeEditPublishedEvent)) {
    // Ignore the US law space for now
    const editsPublished = maybeEditPublishedEvent.right.editsPublished.filter(
      e => e.daoAddress !== US_LAW_SPACE.daoAddress
    );

    eventsInBlock.push({
      editsPublished: editsPublished,
    });
  }

  return eventsInBlock;
}
