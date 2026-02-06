import { Graph, Position, SystemIds } from '@geoprotocol/geo-sdk';
import { Draft, produce } from 'immer';

import { DATA_TYPE_ENTITY_IDS, DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY, VIDEO_TYPE, VIDEO_URL_PROPERTY } from '../constants';
import { ID } from '../id';
import { OmitStrict } from '../types';
import { DataType, Relation, Value } from '../types';
import { extractValueString } from '../utils/value';
import { GeoStore } from './store';
import { store, useSyncEngine } from './use-sync-engine';

/** Convert a Uint8Array or string ID to a hex string. */
function toHexId(id: unknown): string {
  if (typeof id === 'string') {
    return id;
  }
  if (id instanceof Uint8Array) {
    return Array.from(id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for other array-like types
  if (Array.isArray(id) || (id && typeof id === 'object' && 'length' in id)) {
    return Array.from(id as ArrayLike<number>)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return String(id);
}

type Recipe<T> = (draft: Draft<T>) => void | T | undefined;
type GeoProduceFn<T> = (base: T, recipe: Recipe<T>) => void;

/**
 * The Mutator interface defines common patterns for updating data
 * in the app's local stores. Currently we have three common data models
 * that change:
 * 1. Values
 * 2. Relations
 * 3. Renderables – A unified representation of a Value OR a Relation
 * 4. Properties – Property entities with dataType
 *
 * The Mutator API abstracts complexity for writing to stores directly
 * by orchestrating writes to the appropriate stores based on the type
 * of data model being changed. The stores handle internal state, syncing,
 * persistence, and other effects behind-the-scenes, and update any
 * components subscribed to store state.
 */
export interface Mutator {
  entities: {
    name: {
      set: (entityId: string, spaceId: string, value: string) => void;
    };
  };
  properties: {
    create: (params: {
      entityId: string;
      spaceId: string;
      name: string;
      dataType: DataType;
      renderableTypeId: string | null;
      verified?: boolean;
      toSpaceId?: string;
      skipTypeRelation?: boolean;
    }) => void;
    setDataType: (propertyId: string, dataType: DataType) => void;
  };
  values: {
    get: (id: string, entityId: string) => Value | null;
    set: (value: OmitStrict<Value, 'id'> & { id?: string }) => void;
    update: GeoProduceFn<Value>;
    delete: (value: Value) => void;
  };
  relations: {
    get: (id: string, entityId: string) => Relation | null;
    set: (relation: Relation) => void;
    update: GeoProduceFn<Relation>;
    delete: (relation: Relation) => void;
  };
  images: {
    createAndLink: (params: {
      file: File;
      fromEntityId: string;
      fromEntityName?: string | null;
      relationPropertyId: string;
      relationPropertyName: string | null;
      spaceId: string;
    }) => Promise<{ imageId: string; relationId: string }>;
  };
  videos: {
    createAndLink: (params: {
      file: File;
      fromEntityId: string;
      fromEntityName?: string | null;
      relationPropertyId: string;
      relationPropertyName: string | null;
      spaceId: string;
    }) => Promise<{ videoId: string; relationId: string }>;
  };
  setAsPublished: (valueIds: string[], relationIds: string[]) => void;
}

function createMutator(store: GeoStore): Mutator {
  return {
    entities: {
      name: {
        set: (entityId, spaceId, value) => {
          const newValue: Value = {
            id: ID.createValueId({
              entityId: entityId,
              propertyId: SystemIds.NAME_PROPERTY,
              spaceId,
            }),
            entity: {
              id: entityId,
              name: value,
            },
            property: {
              id: SystemIds.NAME_PROPERTY,
              name: 'Name',
              dataType: 'TEXT',
              renderableType: 'TEXT',
            },
            spaceId,
            value,
          };

          store.setValue(newValue);
        },
      },
    },
    properties: {
      create: ({
        entityId,
        spaceId,
        name,
        dataType,
        renderableTypeId,
        verified = false,
        toSpaceId,
        skipTypeRelation = false,
      }) => {
        // Check existing relations for duplicate prevention
        const existingRelations = store.getResolvedRelations(entityId);

        // Set the name value
        const nameValue: Value = {
          id: ID.createValueId({
            entityId,
            propertyId: SystemIds.NAME_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name,
          },
          property: {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
            dataType: 'TEXT',
            renderableType: null,
          },
          spaceId,
          value: name,
        };

        store.setValue(nameValue);

        // Create the data type relation (matching SDK's Graph.createProperty behavior).
        // RELATION type properties don't get a data type relation — the type is implicit.
        const dataTypeEntityId = DATA_TYPE_ENTITY_IDS[dataType];
        if (dataTypeEntityId) {
          const hasDataTypeRelation = existingRelations.some(
            r => r.type.id === DATA_TYPE_PROPERTY && !r.isDeleted
          );

          if (!hasDataTypeRelation) {
            store.setRelation({
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              spaceId,
              renderableType: 'RELATION',
              verified: false,
              position: Position.generate(),
              type: {
                id: DATA_TYPE_PROPERTY,
                name: 'Data Type',
              },
              fromEntity: {
                id: entityId,
                name: name,
              },
              toEntity: {
                id: dataTypeEntityId,
                name: dataType,
                value: dataTypeEntityId,
              },
            });
          }
        }

        // Register the data type in the store so store.getProperty() works
        store.setDataType(entityId, dataType);

        // When creating property by adding a property type relation,
        // we don't need to create the property type relation again
        if (!skipTypeRelation) {
          const hasTypesRelation = existingRelations.some(
            r =>
              r.type.id === SystemIds.TYPES_PROPERTY &&
              r.toEntity.id === SystemIds.PROPERTY &&
              !r.isDeleted
          );

          if (!hasTypesRelation) {
            const propertyTypeRelation: Relation = {
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              spaceId,
              renderableType: 'RELATION',
              verified,
              toSpaceId,
              position: Position.generate(),
              type: {
                id: SystemIds.TYPES_PROPERTY,
                name: 'Types',
              },
              fromEntity: {
                id: entityId,
                name: name,
              },
              toEntity: {
                id: SystemIds.PROPERTY,
                name: 'Property',
                value: SystemIds.PROPERTY,
              },
            };
            store.setRelation(propertyTypeRelation);
          }
        }

        // If there's a renderableType, create the relation (with duplicate guard)
        if (renderableTypeId) {
          const hasRenderableTypeRelation = existingRelations.some(
            r => r.type.id === RENDERABLE_TYPE_PROPERTY && !r.isDeleted
          );

          if (!hasRenderableTypeRelation) {
            const renderableTypeRelation: Relation = {
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              spaceId,
              renderableType: 'RELATION',
              verified: false,
              position: Position.generate(),
              type: {
                id: RENDERABLE_TYPE_PROPERTY,
                name: 'Renderable Type',
              },
              fromEntity: {
                id: entityId,
                name: name,
              },
              toEntity: {
                id: renderableTypeId,
                name: renderableTypeId,
                value: renderableTypeId,
              },
            };
            store.setRelation(renderableTypeRelation);
          }
        }
      },
      setDataType: (propertyId: string, dataType: DataType) => {
        store.setDataType(propertyId, dataType);
      },
    },
    values: {
      get: (id, entityId) => store.getValue(id, entityId),
      set: newValue => {
        const id = ID.createValueId({
          entityId: newValue.entity.id,
          propertyId: newValue.property.id,
          spaceId: newValue.spaceId,
        });

        const next: Value = {
          ...newValue,
          id,
        };

        store.setValue(next);
      },
      update: (base, recipe) => {
        const newValue = produce(base, recipe);
        store.setValue(newValue);
      },
      delete: newValue => {
        store.deleteValue(newValue);
      },
    },
    relations: {
      get: (id, entityId) => store.getRelation(id, entityId),
      set: newRelation => {
        store.setRelation(newRelation);
      },
      update: (base, recipe) => {
        const newRelation = produce(base, recipe);
        store.setRelation(newRelation);
      },
      delete: newRelation => {
        store.deleteRelation(newRelation);
      },
    },
    images: {
      createAndLink: async ({
        file,
        fromEntityId,
        fromEntityName,
        relationPropertyId,
        relationPropertyName,
        spaceId,
      }) => {
        // Create the image entity using the Graph API
        // Use TESTNET network to upload to Pinata via alternative gateway
        const { id: imageId, ops: createImageOps } = await Graph.createImage({
          blob: file,
          network: 'TESTNET',
        });

        for (const op of createImageOps) {
          if (op.type === 'createRelation') {
            store.setRelation({
              id: toHexId(op.id),
              entityId: op.entity ? toHexId(op.entity) : toHexId(op.from),
              fromEntity: {
                id: toHexId(op.from),
                name: null,
              },
              type: {
                id: toHexId(op.relationType),
                name: 'Image',
              },
              toEntity: {
                id: toHexId(op.to),
                name: 'Image',
                value: toHexId(op.to),
              },
              spaceId,
              position: Position.generate(),
              verified: false,
              renderableType: 'RELATION',
            });
          } else if (op.type === 'createEntity') {
            for (const pv of op.values) {
              store.setValue({
                id: ID.createValueId({
                  entityId: toHexId(op.id),
                  propertyId: toHexId(pv.property),
                  spaceId,
                }),
                entity: {
                  id: toHexId(op.id),
                  name: null,
                },
                property: {
                  id: toHexId(pv.property),
                  name: 'Image Property',
                  dataType: 'TEXT',
                  renderableType: 'URL',
                },
                spaceId,
                value: extractValueString(pv.value),
              });
            }
          }
        }

        // Create relation from parent entity to image entity
        const relationId = ID.createEntityId();
        const imageIdStr = toHexId(imageId);
        store.setRelation({
          id: relationId,
          entityId: ID.createEntityId(),
          fromEntity: {
            id: fromEntityId,
            name: fromEntityName || '',
          },
          type: {
            id: relationPropertyId,
            name: relationPropertyName || '',
          },
          toEntity: {
            id: imageIdStr,
            name: null,
            value: imageIdStr,
          },
          spaceId,
          position: Position.generate(),
          verified: false,
          renderableType: 'IMAGE',
        });

        return { imageId: imageIdStr, relationId };
      },
    },
    videos: {
      createAndLink: async ({
        file,
        fromEntityId,
        fromEntityName,
        relationPropertyId,
        relationPropertyName,
        spaceId,
      }) => {
        // Create the video entity using the Graph API (uses same upload mechanism as images)
        // Use TESTNET network to upload to Pinata via alternative gateway
        const { id: videoId, ops: createVideoOps } = await Graph.createImage({
          blob: file,
          network: 'TESTNET',
        });

        let ipfsUrl: string | undefined;
        for (const op of createVideoOps) {
          if (op.type === 'createEntity') {
            const ipfsValue = op.values.find(pv => {
              const valStr = extractValueString(pv.value);
              return valStr.startsWith('ipfs://');
            });
            if (ipfsValue) {
              ipfsUrl = extractValueString(ipfsValue.value);
              break;
            }
          }
        }

        // Create a video entity with VIDEO_URL_PROPERTY instead of IMAGE_URL_PROPERTY
        const videoIdStr = toHexId(videoId);
        if (ipfsUrl) {
          store.setValue({
            id: ID.createValueId({
              entityId: videoIdStr,
              propertyId: VIDEO_URL_PROPERTY,
              spaceId,
            }),
            entity: {
              id: videoIdStr,
              name: null,
            },
            property: {
              id: VIDEO_URL_PROPERTY,
              name: 'Video URL',
              dataType: 'TEXT',
              renderableType: 'URL',
            },
            spaceId,
            value: ipfsUrl,
          });
        }

        // Add Types relation to mark the video entity as a Video type
        store.setRelation({
          id: ID.createEntityId(),
          entityId: ID.createEntityId(),
          fromEntity: {
            id: videoIdStr,
            name: null,
          },
          type: {
            id: SystemIds.TYPES_PROPERTY,
            name: 'Types',
          },
          toEntity: {
            id: VIDEO_TYPE,
            name: 'Video',
            value: VIDEO_TYPE,
          },
          spaceId,
          position: Position.generate(),
          verified: false,
          renderableType: 'RELATION',
        });

        // Create relation from parent entity to video entity
        const relationId = ID.createEntityId();
        store.setRelation({
          id: relationId,
          entityId: ID.createEntityId(),
          fromEntity: {
            id: fromEntityId,
            name: fromEntityName || '',
          },
          type: {
            id: relationPropertyId,
            name: relationPropertyName || '',
          },
          toEntity: {
            id: videoIdStr,
            name: null,
            value: videoIdStr,
          },
          spaceId,
          position: Position.generate(),
          verified: false,
          renderableType: 'VIDEO',
        });

        return { videoId: videoIdStr, relationId };
      },
    },
    setAsPublished: (valueIds, relationIds) => {
      store.setAsPublished(valueIds, relationIds);
    },
  };
}

export const storage: Mutator = createMutator(store);

export function useMutate() {
  const { store } = useSyncEngine();

  return {
    storage: createMutator(store),
  };
}
