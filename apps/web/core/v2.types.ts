import { SystemIds } from '@graphprotocol/grc-20';

import { GEO_LOCATION } from './constants';

export type DataType = 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'TIME' | 'POINT' | 'RELATION';
export type RenderableType = typeof SystemIds.IMAGE | typeof SystemIds.URL | typeof GEO_LOCATION; // GEO_LOCATION needs to be migrated to SDK
export type RawRenderableType = string; // UUIDs of renderable types

export type Property = {
  id: string;
  name: string | null;
  dataType: DataType;
  isDataTypeEditable?: boolean;
  relationValueTypes?: { id: string; name: string | null }[];
  renderableType?: RawRenderableType | null; // Raw UUID from API, gets converted in to-renderables.ts
};

// @TODO: Relation renderable types + values
//
// How do we handle edits in the app and how they map to the publish flow?
//   local relations + local values + tombstones? If we unify the remote and local data we'll need something
//   like "local only" on the relations and values.

/**
 * Since knowledge graph data can exist locally AND remotely, we use this metadata
 * to differentiate them.
 *
 * @TODO: We can probably put this into a separate domain associated with
 * local state
 */
type LocalMetadata = {
  // Used to render local data as a placeholder. This is usually used
  // to prepopulate data as a result of an entity's schema or when
  // creating new entity data from a "template"
  placeholder?: boolean;
  // Used to determine when data was last modified. This can be used
  // for merging heuristics between local and remote data.
  timestamp?: string | null;
  // Used to determine if the data has been deleted locally.
  isDeleted?: boolean;
  // Used to determine if the data has been modified locally.
  isLocal?: boolean;
  // Used to determine if the data has been published to the remote.
  // This is used to optimistically render the data while waiting for the
  // backend to catch up with the transaction. If data has been published,
  // we can safely prune it from the persisted store.
  hasBeenPublished?: boolean;
};

export type ValueOptions = {
  unit?: string;
  language?: string;
};

export type Value = LocalMetadata & {
  id: string;
  entity: {
    id: string;
    name: string | null;
  };
  property: Property;
  value: string;
  spaceId: string;
  options?: ValueOptions | null;
};

export type Relation = LocalMetadata & {
  id: string;
  entityId: string;
  type: {
    id: string;
    name: string | null;
  };
  fromEntity: {
    id: string;
    name: string | null;
  };
  toEntity: {
    id: string;
    name: string | null;
    value: string;
  };
  renderableType: RenderableEntityType;
  position?: string;
  verified?: boolean;
  spaceId: string;
  toSpaceId?: string;
};

export type Entity = {
  id: string;
  name: string | null;
  description: string | null;
  spaces: string[];
  types: { id: string; name: string | null }[];
  relations: Relation[];
  values: Value[];
};

export type EntityWithSchema = Entity & { schema: Property[] };

export type RenderableEntityType = 'IMAGE' | 'RELATION' | 'DATA' | 'TEXT' | 'POINT';

// Renderable fields are a special data model to represent us rendering both
// triples and relations in the same way. This is used across tables and entity
// pages in places where we want to render triples and relations together.
// Editing these values mostly works the same way as ops, so we need the same
// properties that ops mostly do in order to upsert or remove the renderable
// fields.
// All possible flattened render types
export type FlattenedRenderType =
  | 'TEXT'
  | 'NUMBER'
  | 'CHECKBOX'
  | 'TIME'
  | 'POINT'
  | 'URL'
  | 'GEO_LOCATION'
  | 'RELATION'
  | 'IMAGE';

export type NativeRenderableProperty = {
  type: Extract<FlattenedRenderType, 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'TIME' | 'POINT' | 'URL' | 'GEO_LOCATION'>;
  renderableType?: RawRenderableType;
  entityId: string;
  entityName: string | null;
  propertyId: string;
  propertyName: string | null;
  spaceId: string;
  value: string;
  placeholder?: boolean;
  options?: ValueOptions;
};

type RelationPropertyProperties = {
  fromEntityId: string;
  fromEntityName: string | null;
  relationId: string;
  relationEntityId: string;
  propertyId: string;
  propertyName: string | null;
  spaceId: string;
  valueName: string | null; // name of the entity
  value: string;
  position?: string;
  verified?: boolean;
  toSpaceId?: string;
  placeholder?: boolean;
};

export type BaseRelationRenderableProperty = {
  type: Extract<FlattenedRenderType, 'RELATION'>;
} & RelationPropertyProperties;

export type ImageRelationRenderableProperty = {
  type: Extract<FlattenedRenderType, 'IMAGE'>;
} & RelationPropertyProperties;

export type PointRelationRenderableProperty = {
  type: Extract<FlattenedRenderType, 'POINT'>;
} & NativeRenderableProperty;

export type RelationRenderableProperty = BaseRelationRenderableProperty | ImageRelationRenderableProperty;

export type ValueRenderableProperty = NativeRenderableProperty;
export type RenderableProperty =
  | ValueRenderableProperty
  | BaseRelationRenderableProperty
  | ImageRelationRenderableProperty
  | PointRelationRenderableProperty;

// The types of renderables don't map 1:1 to the triple value types. We might
// also render relations with a specific type, e.g., an Image entity or a
// Person entity, etc.
export type SwitchableRenderableType =
  | 'TEXT'
  | 'RELATION'
  | 'URL'
  | 'TIME'
  | 'IMAGE'
  | 'CHECKBOX'
  | 'NUMBER'
  | 'POINT'
  | 'GEO_LOCATION';

export type SearchResult = {
  id: string;
  name: string | null;
  description: string | null;
  spaces: SpaceEntity[];
  types: { id: string; name: string | null }[];
};

export type SpaceEntity = Entity & {
  spaceId: string;
  // @TODO: Image should be handled in the API server
  image: string;
};

export type Cell = {
  slotId: string;
  cellId: string;
  name: string | null;
  renderables: RenderableProperty[];
  description?: string | null;
  image?: string | null;
  space?: string;
  verified?: boolean;
  renderedPropertyId?: string;
  collectionId?: string;
  relationId?: string;
};

export type Row = {
  entityId: string;
  // There's a UX where users can press a + button to create a new row. This
  // new row doesn't have any data and isn't associated with an entity until
  // the association is made by adding real data or selecting an existing entity.
  placeholder?: boolean;
  // attributeId -> Cell
  columns: Record<string, Cell>;
};

export type ProposalStatus = 'ACCEPTED' | 'PROPOSED' | 'REJECTED';
