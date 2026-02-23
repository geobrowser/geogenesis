import { Property } from '~/core/types';

export type PowerToolsRow = {
  entityId: string;
  spaceId: string;
  placeholder?: boolean;
  collectionId?: string;
  relationId?: string;
  toSpaceId?: string;
  verified?: boolean;
};

export type PowerToolsData = {
  rows: PowerToolsRow[];
  properties: Property[];
  propertiesById: Record<string, Property>;
  isLoading: boolean;
  isInitialLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  totalCount?: number;
  allEntityIds: string[];
};
