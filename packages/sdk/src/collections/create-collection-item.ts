import { CreateTripleAction } from '@geogenesis/action-schema';

interface CreateCollectionItemArgs {
  spaceId: string; // 0x...
  attributeId: string; // uuid
}

export function createCollectionItem(args: CreateCollectionItemArgs): CreateTripleAction[] {
  return [];
}
