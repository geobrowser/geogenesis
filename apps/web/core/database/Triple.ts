/**
 * This is a WIP file for centralizing definition and logic for Triples in the app.
 *
 * All logic for defining triple types, mapping between renderables and triples, etc.
 * should live here instead of disparate places throughout the app.
 */
import { ID } from '../id';
import { Value } from '../types';

export interface BaseTriple {
  space: string;
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  value: Value;
}

type ISODate = string;

// We have a set of application-specific metadata that we attach to each local version of a triple.
export interface LocalTriple extends BaseTriple {
  id: string; // `${spaceId}:${entityId}:${attributeId}`
  // We keep published triples optimistically in the store. It can take a while for the blockchain
  // to process our transaction, then a few seconds for the subgraph to pick it up and index it.
  // We keep the published triples so we can continue to render them locally while the backend
  // catches up.
  hasBeenPublished: boolean;
  timestamp: ISODate; // ISO-8601
  isDeleted: boolean;
}

export class Triple {
  static make(
    triple: BaseTriple,
    options: { hasBeenPublished?: boolean; isDeleted?: boolean } = { hasBeenPublished: false, isDeleted: false }
  ): LocalTriple {
    return {
      ...triple,
      id: ID.createTripleId(triple),
      hasBeenPublished: options.hasBeenPublished ?? false,
      timestamp: new Date().toISOString(),
      isDeleted: options.hasBeenPublished ?? false,
    };
  }
}
