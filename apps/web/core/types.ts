import { SYSTEM_IDS } from '@geogenesis/sdk';

import { EntityId } from './io/schema';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ValueType =
  | 'TEXT'
  | 'URL'
  | 'TIME'
  | 'NUMBER'
  // | GEO_LOCATION
  | 'CHECKBOX';

export type Value = {
  type: 'TEXT' | 'URL' | 'TIME' | 'CHECKBOX' | 'NUMBER';
  value: string;
};

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

export type RenderableEntityType = 'IMAGE' | 'RELATION' | 'DATA' | 'TEXT';

// Renderable fields are a special data model to represent us rendering both
// triples and relations in the same way. This is used across tables and entity
// pages in places where we want to render triples and relations together.
// Editing these values mostly works the same way as ops, so we need the same
// properties that ops mostly do in order to upsert or remove the renderable
// fields.
export type NativeRenderableProperty = {
  type: Value['type'];
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  value: string;
  placeholder?: boolean;
};

type RelationPropertyProperties = {
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  relationId: string;
  valueName: string | null; // name of the entity
  value: string;
  placeholder?: boolean;
};

export type BaseRelationRenderableProperty = {
  type: 'RELATION';
} & RelationPropertyProperties;

export type ImageRelationRenderableProperty = {
  type: 'IMAGE';
} & RelationPropertyProperties;

export type RelationRenderableProperty = BaseRelationRenderableProperty | ImageRelationRenderableProperty;

export type TripleRenderableProperty = NativeRenderableProperty;
export type RenderableProperty =
  | TripleRenderableProperty
  | BaseRelationRenderableProperty
  | ImageRelationRenderableProperty;

// The types of renderables don't map 1:1 to the triple value types. We might
// also render relations with a specific type, e.g., an Image entity or a
// Person entity, etc.
export type SwitchableRenderableType = 'TEXT' | 'RELATION' | 'URL' | 'TIME' | 'IMAGE' | 'CHECKBOX' | 'NUMBER';

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
  | typeof SYSTEM_IDS.TIME
  | typeof SYSTEM_IDS.URL
  | typeof SYSTEM_IDS.CHECKBOX
  | typeof SYSTEM_IDS.NUMBER
  | typeof SYSTEM_IDS.IMAGE;

export type GeoType = {
  entityId: string;
  entityName: string | null;
  space: string;
};

// A column in the table _is_ an Entity. It's a reference to a specific Attribute entity.
// In this use case we don't really care about description, types, etc.
export interface PropertySchema {
  id: EntityId;
  name: string | null;
  valueType: ValueTypeId;
  relationValueTypeId?: EntityId;
  relationValueTypeName?: string | null;
  homeSpace?: string;
}

export type Relation = {
  hasBeenPublished?: boolean;
  space: string;
  id: EntityId;
  index: string;
  typeOf: {
    id: EntityId;
    name: string | null;
  };
  fromEntity: {
    id: EntityId;
    name: string | null;
  };
  toEntity: {
    id: EntityId;
    name: string | null;

    // The "Renderable Type" for an entity provides a hint to the consumer
    // of the entity to _what_ the entity is so they know how they should
    // render it depending on their use case.
    renderableType: RenderableEntityType;

    // The value of the To entity depends on the type of the To entity. e.g.,
    // if the entity is an image, the value is the URL of the image. If it's
    // a regular entity, the valu is the ID. It's a bit duplicative, but will
    // make more sense when we add support for other entity types.
    value: string;
  };
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
};

export type Row = {
  entityId: string;
  // attributeId -> Cell
  columns: Record<string, Cell>;
};

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
export type TripleWithImageValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithDateValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithUrlValue = OmitStrict<Triple, 'value'> & { value: Value };

export type SpaceId = string;
export type SpaceTriples = Record<SpaceId, Triple[]>;

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
  | 'interest';
export type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL';
