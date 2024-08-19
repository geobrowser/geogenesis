import { SYSTEM_IDS } from '@geogenesis/sdk';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ValueType = 'TEXT' | 'ENTITY' | 'URI' | 'TIME';
// | GEO_LOCATION
// | 'CHECKBOX'

export type AppValue = {
  type: 'TEXT' | 'URI' | 'TIME';
  value: string;
};

// We store unique metadata on an ENTITY value type so we map it
// to a separate data structure. Only entities with type "Relation"
// should be using triples with entity values.
export type AppEntityValue = {
  type: 'ENTITY';
  value: string;
  name: string | null;
};

export type Value = AppEntityValue | AppValue;

export type SetTripleAppOp = {
  type: 'SET_TRIPLE';
  id: string;
  attributeId: string;
  entityId: string;
  attributeName: string | null;
  entityName: string | null;
  value: Value;
};

export type DeleteTripleAppOp = {
  type: 'DELETE_TRIPLE';
  id: string;
  attributeId: string;
  entityId: string;
  attributeName: string | null;
  entityName: string | null;
  value: Value;
};

export type AppOp = SetTripleAppOp | DeleteTripleAppOp;

export type Triple = {
  space: string;
  entityId: string;
  attributeId: string;
  value: Value;

  entityName: string | null;
  attributeName: string | null;

  // We have a set of application-specific metadata that we attach to each local version of a triple.
  id?: string; // `${spaceId}:${entityId}:${attributeId}`
  // We keep published triples optimistically in the store. It can take a while for the blockchain
  // to process our transaction, then a few seconds for the subgraph to pick it up and index it.
  // We keep the published triples so we can continue to render them locally while the backend
  // catches up.
  hasBeenPublished?: boolean;
  timestamp?: string; // ISO-8601
  isDeleted?: boolean;
};

export type RenderableEntityType = 'IMAGE' | 'DEFAULT' | 'BLOCK'; // specific block types?

// Renderable fields are a special data model to represent us rendering both
// triples and relations in the same way. This is used across tables and entity
// pages in places where we want to render triples and relations together.
// Editing these values mostly works the same way as ops, so we need the same
// properties that ops mostly do in order to upsert or remove the renderable
// fields.
export type NativeRenderableProperty = {
  type: AppValue['type'];
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  value: string;
};

// Entity renderable fields should only exist on Relations pages
export type EntityRenderableProperty = {
  type: 'ENTITY';
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  value: {
    value: string;
    name: string | null;
  };
};

export type RelationRenderableProperty = {
  type: 'RELATION' | 'IMAGE';
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  relationId: string;
  valueName: string | null; // name of the entity
  value: string;
};

export type TripleRenderableProperty = NativeRenderableProperty | EntityRenderableProperty;
export type RenderableProperty = TripleRenderableProperty | RelationRenderableProperty;

// The types of renderables don't map 1:1 to the triple value types. We might
// also render relations with a specific type, e.g., an Image entity or a
// Person entity, etc.
export type SwitchableRenderableType = 'TEXT' | 'RELATION' | 'URI' | 'TIME' | 'IMAGE';

export type ReviewState =
  | 'idle'
  | 'reviewing'
  | 'publishing-ipfs'
  | 'signing-wallet'
  | 'publishing-contract'
  | 'publish-complete'
  | 'publish-error';

export type FilterField =
  | 'entity-id'
  | 'entity-name'
  | 'attribute-id'
  | 'attribute-name'
  | 'value'
  | 'linked-to'
  | 'starts-with'
  | 'not-space-id';

export type FilterClause = {
  field: FilterField;
  value: string;
};

export type FilterState = FilterClause[];

export type ValueTypeId =
  | typeof SYSTEM_IDS.TEXT
  | typeof SYSTEM_IDS.RELATION
  | typeof SYSTEM_IDS.DATE
  | typeof SYSTEM_IDS.WEB_URL;

export type GeoType = {
  entityId: string;
  entityName: string | null;
  space: string;
};

// A column in the table _is_ an Entity. It's a reference to a specific Attribute entity.
// In this use case we don't really care about description, types, etc.
export interface Column {
  id: string;
  triples: Triple[];
}

export interface Cell {
  columnId: string;
  entityId: string;
  triples: Triple[];
}

export type Row = Record<string, Cell>;

export type Profile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  profileLink: string | null;
  address: `0x${string}`;
};

export type AppEnv = 'development' | 'testnet' | 'production';

export type RelationValueType = {
  typeId: string;
  typeName: string | null;
  spaceIdOfAttribute: string;
};

export type RelationValueTypesByAttributeId = Record<string, Array<RelationValueType>>;

export type TripleWithStringValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithEntityValue = OmitStrict<Triple, 'value'> & { value: AppEntityValue };
export type TripleWithImageValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithDateValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithUrlValue = OmitStrict<Triple, 'value'> & { value: Value };

export type SpaceId = string;
export type SpaceTriples = Record<SpaceId, Triple[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, Triple>>;

export type SpaceType =
  | 'default'
  | 'company'
  | 'nonprofit'
  | 'personal'
  | 'academic-field'
  | 'region'
  | 'industry'
  | 'protocol'
  | 'dao'
  | 'government-org'
  | 'interest-group';
export type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL';

export type CollectionItem = {
  id: string; // id of the collection item entity itself
  collectionId: string; // pointing to the collection referenced by the collection item
  entity: {
    // pointing to the entity referenced by the collection item
    id: string;
    name: string | null;
    types: string[];
  };
  value: {
    type: 'IMAGE' | 'ENTITY';
    // either the name of the thing we're rendering or the image or null in the  case that
    // it's an entity value type but does not have a name
    value: string | null;
  };
  index: string; // the order of the item in the list
};
