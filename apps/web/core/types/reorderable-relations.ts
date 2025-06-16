import { RelationRenderableProperty } from '../types';

/**
 * Props interface for reorderable relation chip components.
 * Standardizes the props across different drag-and-drop implementations.
 */
export interface ReorderableRelationChipsProps {
  relations: RelationRenderableProperty[];
  spaceId: string;
  onDeleteRelation: (relation: RelationRenderableProperty) => void;
}