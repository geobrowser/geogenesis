export interface DiffChunk {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export type TextValueType = 'TEXT';

export type SimpleValueType =
  | 'BOOLEAN'
  | 'INTEGER'
  | 'FLOAT'
  | 'DECIMAL'
  | 'BYTES'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'SCHEDULE'
  | 'POINT'
  | 'EMBEDDING'
  | 'RECT';

export type ValueType = TextValueType | SimpleValueType;

export interface TextValueChange {
  propertyId: string;
  propertyName?: string | null;
  spaceId: string;
  type: TextValueType;
  before: string | null;
  after: string | null;
  diff: DiffChunk[];
}

export interface SimpleValueChange {
  propertyId: string;
  propertyName?: string | null;
  spaceId: string;
  type: SimpleValueType;
  before: string | null;
  after: string | null;
}

export type ValueChange = TextValueChange | SimpleValueChange;

export interface RelationChange {
  relationId: string;
  typeId: string;
  typeName?: string | null;
  spaceId: string;
  changeType: 'ADD' | 'REMOVE' | 'UPDATE';
  before?: {
    toEntityId: string;
    toEntityName?: string | null;
    toSpaceId?: string | null;
    position?: string | null;
    imageUrl?: string | null;
  } | null;
  after?: {
    toEntityId: string;
    toEntityName?: string | null;
    toSpaceId?: string | null;
    position?: string | null;
    imageUrl?: string | null;
  } | null;
}

export interface TextBlockChange {
  id: string;
  type: 'textBlock';
  before: string | null;
  after: string | null;
  diff: DiffChunk[];
}

export interface ImageBlockChange {
  id: string;
  type: 'imageBlock';
  before: string | null;
  after: string | null;
}

export interface DataBlockChange {
  id: string;
  type: 'dataBlock';
  before: string | null;
  after: string | null;
  blockName?: string | null;
  values?: ValueChange[];
  relations?: RelationChange[];
}

export type BlockChange = TextBlockChange | ImageBlockChange | DataBlockChange;

export interface EntityDiff {
  entityId: string;
  name: string | null;
  values: ValueChange[];
  relations: RelationChange[];
  blocks: BlockChange[];
}
