import { EntityId } from '~/core/io/schema';

import {
  BaseRelationRenderableProperty,
  EntityRenderableProperty,
  ImageRelationRenderableProperty,
  NativeRenderableProperty,
} from '../../types';

export type BlockId = string;

export type BlockValueType = 'textBlock' | 'tableFilter' | 'imageBlock' | 'tableBlock' | 'markdownContent';

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
  valueName: string | null;
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
export type RenderableChange = TripleChange | RelationChange;
export type RelationChange = BaseRelationChange | ImageRelationChange;
export type TripleChange = NativeTripleChange | EntityTripleChange;

type BaseRelationChange = {
  type: BaseRelationRenderableProperty['type'];
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

type ImageRelationChange = {
  type: ImageRelationRenderableProperty['type'];
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

type NativeTripleChange = {
  type: NativeRenderableProperty['type'];
  attribute: Attribute;
  before: TripleChangeValue | null;
  after: TripleChangeValue;
};

type EntityTripleChange = {
  type: EntityRenderableProperty['type'];
  attribute: Attribute;
  before: RelationChangeValue | null;
  after: RelationChangeValue;
};

export type EntityChange = {
  id: EntityId;
  name: string | null;
  blockChanges: RenderableChange[];
  changes: Record<string, RenderableChange[]>;
};
