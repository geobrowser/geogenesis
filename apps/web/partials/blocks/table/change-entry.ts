import { SearchResult } from '~/core/v2.types';
import { RenderableEntityType } from '~/core/v2.types';
import { DataType } from '~/core/v2.types';

type EventPayload = {
  type: string;
  payload: {
    renderable: {
      attributeId: string;
      entityId: string;
      spaceId: string;
      attributeName: string;
      entityName: string | null;
      type: DataType;
      value: string;
    };
    value: { type: RenderableEntityType; value: string };
  };
};

type ChangeEntryParams =
  | {
      type: 'EVENT';
      data: EventPayload;
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
