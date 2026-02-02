// GRC-20 v2 data types
export type DataType =
  | 'TEXT'
  | 'INT64'
  | 'FLOAT64'
  | 'DECIMAL'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'TIME'
  | 'POINT'
  | 'RELATION'
  | 'BYTES'
  | 'SCHEDULE'
  | 'EMBEDDING';

// Legacy type aliases for backwards compatibility during migration
export type LegacyDataType = 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'TIME' | 'POINT' | 'RELATION';

/**
 * Maps legacy GRC-20 data type names from older API responses to current v2 types.
 *
 * Background: Some older data in the knowledge graph uses 'BOOLEAN' as the data type
 * string, but GRC-20 v2 standardized on 'BOOL'. This mapping ensures backwards
 * compatibility when reading data from the API or reconstructing entities from storage.
 */
export const LEGACY_DATA_TYPE_MAPPING: Partial<Record<string, DataType>> = {
  BOOLEAN: 'BOOL',
} as const;
export type RenderableType = 'IMAGE' | 'VIDEO' | 'URL' | 'GEO_LOCATION' | 'PLACE'; // GEO_LOCATION needs to be migrated to SDK
export type RawRenderableType = string; // UUIDs of renderable types

export type Property = {
  id: string;
  name: string | null;
  dataType: DataType;
  isDataTypeEditable?: boolean;
  relationValueTypes?: { id: string; name: string | null }[];
  /**
   * We might render _any_ arbitrary renderable type in the UI or we might
   * render a _specific_ renderable type. We want to make sure the strict
   * representation is type safe so that we don't miss any renderable types
   * that we should be supporting.
   */
  renderableType?: RawRenderableType | null; // Raw UUID from API, gets converted in to-renderables.ts
  renderableTypeStrict?: RenderableType | null; // Renderable type used in the frontend, converted from raw UUID
  format?: string | null; // Format string for the property
  unit?: string | null; // Unit ID for the property
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
  /**
   * UNIX timestamp in seconds
   */
  updatedAt?: string;
};

export type EntityWithSchema = Entity & { schema: Property[] };

export type RenderableEntityType = 'IMAGE' | 'VIDEO' | 'RELATION' | 'DATA' | 'TEXT' | 'POINT';

// Renderable fields are a special data model to represent us rendering both
// triples and relations in the same way. This is used across tables and entity
// pages in places where we want to render triples and relations together.
// Editing these values mostly works the same way as ops, so we need the same
// properties that ops mostly do in order to upsert or remove the renderable
// fields.
// All possible flattened render types (GRC-20 v2)
export type FlattenedRenderType =
  | 'TEXT'
  | 'INT64'
  | 'FLOAT64'
  | 'DECIMAL'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'TIME'
  | 'POINT'
  | 'URL'
  | 'GEO_LOCATION'
  | 'RELATION'
  | 'IMAGE'
  | 'VIDEO'
  | 'PLACE';

// The types of renderables don't map 1:1 to the triple value types. We might
// also render relations with a specific type, e.g., an Image entity or a
// Person entity, etc.
export type SwitchableRenderableType =
  | 'TEXT'
  | 'RELATION'
  | 'URL'
  | 'DATE'
  | 'DATETIME'
  | 'TIME'
  | 'IMAGE'
  | 'VIDEO'
  | 'BOOL'
  | 'INT64'
  | 'FLOAT64'
  | 'DECIMAL'
  | 'POINT'
  | 'GEO_LOCATION'
  | 'PLACE';

/**
 * Human-readable labels for switchable renderable types
 */
export const SWITCHABLE_RENDERABLE_TYPE_LABELS: Record<SwitchableRenderableType, string> = {
  TEXT: 'Text',
  URL: 'Url',
  RELATION: 'Relation',
  IMAGE: 'Image',
  VIDEO: 'Video',
  BOOL: 'Checkbox',
  INT64: 'Integer',
  FLOAT64: 'Float',
  DECIMAL: 'Decimal',
  DATE: 'Date',
  DATETIME: 'Date & Time',
  TIME: 'Time',
  POINT: 'Point',
  GEO_LOCATION: 'Geo Location',
  PLACE: 'Place',
};

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
  propertyId: string;
  name: string | null;
  description?: string | null;
  image?: string | null;
  space?: string;
  verified?: boolean;
  /**
   * We can render a different property in the same "slot"
   */
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

  position?: string;
};

export type ProposalStatus = 'ACCEPTED' | 'PROPOSED' | 'REJECTED';
