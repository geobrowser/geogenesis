import { CreateTripleAction } from '@geogenesis/action-schema';

interface CreateCollectionArgs {
  spaceId: string; // 0x...
  attributeId: string; // uuid
}

export function createCollection(args: CreateCollectionArgs): CreateTripleAction[] {
  return [];
}
