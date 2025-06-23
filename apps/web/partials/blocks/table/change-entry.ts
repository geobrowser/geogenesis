import { SearchResult } from '~/core/v2.types';

type ChangeEntryParams =
  | {
      type: 'EVENT';
      data: any; // @TODO(migration): Correct type
    }
  | {
      type: 'Create';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: string; verified?: boolean };
    }
  | {
      type: 'Find';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: string; verified?: boolean };
    };

// @TODO(migration): Correct type
export type onChangeEntryFn = (context: any, event: ChangeEntryParams) => void;

export type onLinkEntryFn = (
  id: string,
  to: {
    id: string;
    name: string | null;
    space?: string;
    verified?: boolean;
  },
  currentlyVerified?: boolean
) => void;
