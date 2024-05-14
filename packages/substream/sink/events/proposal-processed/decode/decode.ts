import { Effect } from 'effect';
import fs from 'fs';
import { Type, loadSync } from 'protobufjs';

import { ZodEdit } from './zod';

const decode = Effect.gen(function* (_) {
  const root = loadSync('schema.proto');
  const Edit = root.lookupType('Edit');

  let fileContents = fs.readFileSync(`data.pb`);
  const deserializedData = yield* _(deserialize(fileContents, Edit));

  const data = ZodEdit.safeParse(deserializedData);

  console.log('success', data.success);
});

function deserialize(data: Buffer, messageType: Type) {
  return Effect.gen(function* _() {
    const deserializedData = messageType.decode(data);
    return messageType.toObject(deserializedData, {
      longs: String,
      enums: String,
      bytes: String,
    });
  });
}

Effect.runSync(decode);
