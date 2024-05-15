import { Effect } from 'effect';
import { loadSync } from 'protobufjs';

import { ZodProposalMetadata } from '../events/proposals-created/parser';
import { deserialize } from '../proto';

export function handleDecodeIpfsContentType(buffer: Buffer) {
  return Effect.gen(function* (_) {
    const root = loadSync('schema.proto');
    const Edit = root.lookupType('IpfsContent');

    const deserializedData = deserialize(buffer, Edit);
    const data = ZodProposalMetadata.safeParse(deserializedData);

    if (data.success) {
      return data.data;
    }

    return null;
  });
}
