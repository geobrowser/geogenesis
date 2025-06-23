import { EntityId } from '~/core/io/schema';
import { SearchResult } from '~/core/v2.types';

type ChangeEntryParams =
  | {
      type: 'EVENT';
      data: any; // @TODO(migration): Correct type
    }
  | {
      type: 'Create';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean };
    }
  | {
      type: 'Find';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean };
    };

// @TODO(migration): Correct type
export type onChangeEntryFn = (context: any, event: ChangeEntryParams) => void;

export type onLinkEntryFn = (
  id: string,
  to: {
    id: EntityId;
    name: string | null;
    space?: EntityId;
    verified?: boolean;
  },
  currentlyVerified?: boolean
) => void;
