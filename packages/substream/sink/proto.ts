import type { Type } from 'protobufjs';

export function deserialize(data: Buffer, messageType: Type) {
  const deserializedData = messageType.decode(data);
  return messageType.toObject(deserializedData, {
    longs: String,
    enums: String,
    bytes: String,
  });
}
