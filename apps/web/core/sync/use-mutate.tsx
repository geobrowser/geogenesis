import { Graph, Position, SystemIds } from '@graphprotocol/grc-20';
import { Draft, produce } from 'immer';

import { DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '../constants';
import { PDF_TYPE, PDF_URL } from '../constants';
import { ID } from '../id';
import { OmitStrict } from '../types';
import { DataType, Relation, Value } from '../v2.types';
import { GeoStore } from './store';
import { store, useSyncEngine } from './use-sync-engine';

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
  pdfs: {
    createAndLink: (params: {
      file: File;
      fromEntityId: string;
      fromEntityName?: string | null;
      relationPropertyId: string;
      relationPropertyName: string | null;
      spaceId: string;
    }) => Promise<{ imageId: string; relationId: string }>;
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

        // Set the dataType value
        const dataTypeValue: Value = {
          id: ID.createValueId({
            entityId,
            propertyId: DATA_TYPE_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name,
          },
          property: {
            id: DATA_TYPE_PROPERTY,
            name: 'Data Type',
            dataType: dataType,
            renderableType: null,
          },
          spaceId,
          value: dataType,
        };

        store.setValue(nameValue);
        store.setValue(dataTypeValue);

        // When creating property by adding a property type relation,
        // we don't need to create the property type relation again
        if (!skipTypeRelation) {
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

        // If there's a renderableType, create the relation
        if (renderableTypeId) {
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
              name: renderableTypeId, // This should ideally be the actual name
              value: renderableTypeId,
            },
          };
          store.setRelation(renderableTypeRelation);
        }
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

        // Process the operations returned by Graph.createImage
        for (const op of createImageOps) {
          if (op.type === 'CREATE_RELATION') {
            store.setRelation({
              id: op.relation.id,
              entityId: op.relation.entity,
              fromEntity: {
                id: op.relation.fromEntity,
                name: null,
              },
              type: {
                id: op.relation.type,
                name: 'Image',
              },
              toEntity: {
                id: op.relation.toEntity,
                name: 'Image',
                value: op.relation.toEntity,
              },
              spaceId,
              position: Position.generate(),
              verified: false,
              renderableType: 'RELATION',
            });
          } else if (op.type === 'UPDATE_ENTITY') {
            // Create values for each property in the entity update
            for (const value of op.entity.values) {
              store.setValue({
                id: ID.createValueId({
                  entityId: op.entity.id,
                  propertyId: value.property,
                  spaceId,
                }),
                entity: {
                  id: op.entity.id,
                  name: null,
                },
                property: {
                  id: value.property,
                  name: 'Image Property',
                  dataType: 'TEXT',
                  renderableType: 'URL',
                },
                spaceId,
                value: value.value,
              });
            }
          }
        }

        // Create relation from parent entity to image entity
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
            id: imageId,
            name: null,
            value: imageId,
          },
          spaceId,
          position: Position.generate(),
          verified: false,
          renderableType: 'IMAGE',
        });

        return { imageId, relationId };
      },
    },
    pdfs: {
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
        const { id: pdfId, ops: createImageOps } = await Graph.createImage({
          blob: file,
          network: 'TESTNET',
        });

        // Process the operations returned by Graph.createImage
        for (const op of createImageOps) {
          if (op.type === 'CREATE_RELATION') {
            store.setRelation({
              id: op.relation.id,
              entityId: op.relation.entity,
              fromEntity: {
                id: op.relation.fromEntity,
                name: null,
              },
              type: {
                id: op.relation.type,
                name: 'PDF',
              },
              toEntity: {
                id: PDF_TYPE,
                name: 'PDF',
                value: PDF_TYPE,
              },
              spaceId,
              position: Position.generate(),
              verified: false,
              renderableType: 'RELATION',
            });
          } else if (op.type === 'UPDATE_ENTITY') {
            // Create values for each property in the entity update
            for (const value of op.entity.values) {
              store.setValue({
                id: ID.createValueId({
                  entityId: op.entity.id,
                  propertyId: PDF_URL,
                  spaceId,
                }),
                entity: {
                  id: op.entity.id,
                  name: null,
                },
                property: {
                  id: PDF_URL,
                  name: 'PDF Property',
                  dataType: 'TEXT',
                  renderableType: 'URL',
                },
                spaceId,
                value: value.value,
              });
            }
          }
        }

        // Create relation from parent entity to image entity
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
            id: pdfId,
            name: null,
            value: pdfId,
          },
          spaceId,
          position: Position.generate(),
          verified: false,
          renderableType: 'PDF',
        });

        return { imageId: pdfId, relationId };
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
