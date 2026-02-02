import { DataType, ValueOptions } from '~/core/types';

export type BlockId = string;

export type BlockValueType =
  | 'textBlock'
  | 'imageBlock'
  | 'dataBlock'
  | 'dataBlockFilter'
  | 'dataBlockProperties'
  | 'dataBlockSource'
  | 'dataBlockView';

export type BlockChange = {
  type: BlockValueType;
  before: string | null;
  after: string | null;
};

type ChangeType = {
  type: 'ADD' | 'REMOVE' | 'UPDATE';
};

export type RelationChangeValue = {
  value: string;
  valueName: string | null;
} & ChangeType;

export type TripleChangeValue = {
  value: string;
  // mostly to make discriminated unions easier to handle at consumers by matching
  // the same shape as RelationValueChange
  valueName: null;
  options?: ValueOptions;
} & ChangeType;

type Attribute = {
  id: string;
  name: string | null;
};

/**
 * The data model for how we represent changes maps to the data model we use
 * to render data, either as a native triple, entity triple, or relations and
 * their renderable types.
 *
 * This makes it so the diff UI can work the same way as our standard rendering UI.
 */
export type RelationChange = BaseRelationChange | ImageRelationChange;
export type TripleChange = NativeTripleChange;
export type RenderableChange = TripleChange | RelationChange;

type BaseRelationChange = {
  type: 'RELATION';
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue | null;
};

type ImageRelationChange = {
  type: 'IMAGE';
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue | null;
};

type NativeTripleChange = {
  type: DataType;
  attribute: Attribute;
  before: TripleChangeValue | null;
  after: TripleChangeValue | null;
};

export type EntityChange = {
  id: string;
  name: string | null;
  avatar: string | null;
  blockChanges: BlockChange[];
  changes: RenderableChange[];
};
