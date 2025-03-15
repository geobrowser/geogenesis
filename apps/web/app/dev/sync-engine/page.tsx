'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Relation, Triple } from '~/core/types';

import EntitySearch from './search-component';
import { EntityStore } from './sync-engine';
import { SyncEngineProvider, useCreateEntity, useEntities, useEntity, useSyncEngine } from './use-sync-engine';

// Mock initial data
const mockInitialData = {
  entities: [
    {
      id: 'entity1' as unknown as EntityId,
      name: 'Company',
      description: 'A sample company entity',
      nameTripleSpaces: ['space1'],
      spaces: ['space1'],
      types: [{ id: 'type1' as unknown as EntityId, name: 'Organization' }],
      triples: [],
      relationsOut: [],
    },
    {
      id: 'entity2' as unknown as EntityId,
      name: 'Person',
      description: 'A sample person entity',
      nameTripleSpaces: ['space1'],
      spaces: ['space1'],
      types: [{ id: 'type2' as unknown as EntityId, name: 'Person' }],
      triples: [],
      relationsOut: [],
    },
    {
      id: 'entity3' as unknown as EntityId,
      name: 'Project',
      description: 'A sample project entity',
      nameTripleSpaces: ['space1'],
      spaces: ['space1'],
      types: [{ id: 'type3' as unknown as EntityId, name: 'Project' }],
      triples: [],
      relationsOut: [],
    },
  ],
  triples: {
    ['entity1' as string]: [
      {
        space: 'space1',
        entityId: 'entity1',
        attributeId: 'foundedYear',
        value: { type: 'TEXT', value: '2020' },
        entityName: 'Company',
        attributeName: 'Founded Year',
      },
      {
        space: 'space1',
        entityId: 'entity1',
        attributeId: 'location',
        value: { type: 'TEXT', value: 'San Francisco' },
        entityName: 'Company',
        attributeName: 'Location',
      },
    ],
    ['entity2' as string]: [
      {
        space: 'space1',
        entityId: 'entity2',
        attributeId: 'role',
        value: { type: 'TEXT', value: 'CEO' },
        entityName: 'Person',
        attributeName: 'Role',
      },
    ],
  },
  relations: {
    ['entity1' as string]: [
      {
        space: 'space1',
        id: 'relation1' as unknown as EntityId,
        index: '0',
        typeOf: {
          id: 'hasEmployee' as unknown as EntityId,
          name: 'Has Employee',
        },
        fromEntity: {
          id: 'entity1' as unknown as EntityId,
          name: 'Company',
        },
        toEntity: {
          id: 'entity2' as unknown as EntityId,
          name: 'Person',
          renderableType: 'TEXT',
          value: 'Person',
        },
      },
    ],
    ['entity2' as string]: [
      {
        space: 'space1',
        id: 'relation2' as unknown as EntityId,
        index: '0',
        typeOf: {
          id: 'manages' as unknown as EntityId,
          name: 'Manages',
        },
        fromEntity: {
          id: 'entity2' as unknown as EntityId,
          name: 'Person',
        },
        toEntity: {
          id: 'entity3' as unknown as EntityId,
          name: 'Project',
          renderableType: 'TEXT',
          value: 'Project',
        },
      },
    ],
  },
};

// Enhanced triple display component
function TriplesList({ triples, onDelete }: { triples: Triple[]; onDelete?: (triple: Triple) => void }) {
  if (triples.length === 0) {
    return <div className="text-gray-500 text-sm italic">No properties found</div>;
  }

  return (
    <div className="overflow-hidden rounded border">
      <table className="divide-gray-200 min-w-full divide-y">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-gray-500 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Property</th>
            <th className="text-gray-500 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Value</th>
            {onDelete && <th className="w-16 px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody className="divide-gray-200 divide-y bg-white">
          {triples.map((triple, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="text-gray-900 px-3 py-2 text-sm font-medium">{triple.attributeName}</td>
              <td className="text-gray-500 px-3 py-2 text-sm">{triple.value.value}</td>
              {onDelete && (
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDelete(triple)}
                    className="hover:text-red-700 text-red-500"
                    title="Delete property"
                  >
                    &times;
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Enhanced relation display component
function RelationsList({
  relations,
  entityId,
  onDelete,
}: {
  relations: Relation[];
  entityId: EntityId;
  onDelete?: (relation: Relation) => void;
}) {
  if (relations.length === 0) {
    return <div className="text-gray-500 text-sm italic">No relations found</div>;
  }

  // Filter relations where this entity is the source (fromEntity)
  const outgoingRelations = relations.filter(r => r.fromEntity.id === entityId);

  if (outgoingRelations.length === 0) {
    return <div className="text-gray-500 text-sm italic">No outgoing relations</div>;
  }

  return (
    <div className="overflow-hidden rounded border">
      <table className="divide-gray-200 min-w-full divide-y">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-gray-500 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
              Relation Type
            </th>
            <th className="text-gray-500 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
              Target Entity
            </th>
            {onDelete && <th className="w-16 px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody className="divide-gray-200 divide-y bg-white">
          {outgoingRelations.map((relation, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="text-gray-900 px-3 py-2 text-sm font-medium">{relation.typeOf.name}</td>
              <td className="text-gray-500 px-3 py-2 text-sm">{relation.toEntity.name}</td>
              {onDelete && (
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDelete(relation)}
                    className="hover:text-red-700 text-red-500"
                    title="Delete relation"
                  >
                    &times;
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Component to create a new entity
function CreateEntityForm() {
  const { syncEngine } = useSyncEngine();
  const { createEntity, isCreating, error } = useCreateEntity();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newEntityId, setNewEntityId] = useState<EntityId | null>(null);
  const [initialTriples, setInitialTriples] = useState<{ name: string; value: string }[]>([{ name: '', value: '' }]);

  const handleAddTripleField = () => {
    setInitialTriples([...initialTriples, { name: '', value: '' }]);
  };

  const handleTripleChange = (index: number, field: 'name' | 'value', value: string) => {
    const newTriples = [...initialTriples];
    newTriples[index][field] = value;
    setInitialTriples(newTriples);
  };

  const handleRemoveTriple = (index: number) => {
    const newTriples = [...initialTriples];
    newTriples.splice(index, 1);
    setInitialTriples(newTriples);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Filter out empty triples
      const validTriples = initialTriples.filter(t => t.name.trim() && t.value.trim());

      const entityId = await createEntity({
        name,
        description,
        nameTripleSpaces: ['space1'],
        spaces: ['space1'],
        types: [{ id: 'typeCustom' as unknown as EntityId, name: 'Custom' }],
        triples: [],
        relationsOut: [],
      });

      // If we have valid triples, set them after entity creation
      if (validTriples.length > 0) {
        // Small delay to ensure entity is created
        setTimeout(() => {
          // Add all triples to the entity
          validTriples.forEach(t => {
            const attributeId = `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as unknown as EntityId;
            const triple: Triple = {
              space: 'space1',
              entityId: entityId as string,
              attributeId,
              value: { type: 'TEXT', value: t.value },
              entityName: name,
              attributeName: t.name,
            };
            syncEngine.setTriple(triple);
          });
        }, 100);
      }

      setNewEntityId(entityId);
      setName('');
      setDescription('');
      setInitialTriples([{ name: '', value: '' }]);
    } catch (err) {
      console.error('Failed to create entity:', err);
    }
  };

  return (
    <div className="shadow-sm mb-4 rounded-lg border bg-white p-4">
      <h2 className="mb-4 text-xl font-semibold">Create New Entity</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name:</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description:</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            rows={3}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium">Properties:</label>
            <button type="button" onClick={handleAddTripleField} className="hover:text-blue-800 text-blue-600 text-sm">
              + Add Property
            </button>
          </div>

          {initialTriples.map((triple, index) => (
            <div key={index} className="mb-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Property name"
                value={triple.name}
                onChange={e => handleTripleChange(index, 'name', e.target.value)}
                className="flex-1 rounded border p-2"
              />
              <input
                type="text"
                placeholder="Value"
                value={triple.value}
                onChange={e => handleTripleChange(index, 'value', e.target.value)}
                className="flex-1 rounded border p-2"
              />
              {initialTriples.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTriple(index)}
                  className="hover:text-red-700 text-red-500"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={isCreating}
          className="hover:bg-blue-700 disabled:bg-blue-400 bg-blue-600 rounded px-4 py-2 text-white transition-colors"
        >
          {isCreating ? 'Creating...' : 'Create Entity'}
        </button>
      </form>

      {error && <div className="text-red-500 mt-2">Error: {error.message}</div>}

      {newEntityId && (
        <div className="bg-green-50 text-green-800 mt-4 rounded-lg border p-3">
          <p className="mb-2 font-medium">Entity created successfully!</p>
          <div className="text-sm">
            <p>
              New entity ID: <span className="font-mono">{newEntityId as string}</span>
            </p>
            <p className="mt-1">View entity details in the list below.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Component to add a triple to an entity
function AddTripleForm({ entityId }: { entityId: EntityId }) {
  const { entity, operations } = useEntity(entityId);
  const [attributeName, setAttributeName] = useState('');
  const [attributeValue, setAttributeValue] = useState('');
  const [valueType, setValueType] = useState<'TEXT' | 'NUMBER' | 'URL' | 'CHECKBOX'>('TEXT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operations || !entity) return;

    setIsSubmitting(true);
    const attributeId = `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as unknown as EntityId;

    const newTriple: Triple = {
      space: 'space1',
      entityId: entityId as string,
      attributeId: attributeId as string,
      value: {
        type: valueType,
        value: attributeValue,
      },
      entityName: entity.name || '',
      attributeName,
    };

    operations.setTriple(newTriple);

    // Reset form after submission
    setAttributeName('');
    setAttributeValue('');
    setIsSubmitting(false);
  };

  if (!entity) return null;

  return (
    <div className="shadow-sm rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-lg font-medium">Add Property</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Property Name:</label>
          <input
            type="text"
            value={attributeName}
            onChange={e => setAttributeName(e.target.value)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            required
            placeholder="e.g. Email, Phone, Birthday"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Value Type:</label>
          <select
            value={valueType}
            onChange={e => setValueType(e.target.value as any)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
          >
            <option value="TEXT">Text</option>
            <option value="NUMBER">Number</option>
            <option value="URL">URL</option>
            <option value="CHECKBOX">Checkbox</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Value:</label>
          {valueType === 'CHECKBOX' ? (
            <select
              value={attributeValue}
              onChange={e => setAttributeValue(e.target.value)}
              className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type={valueType === 'NUMBER' ? 'number' : 'text'}
              value={attributeValue}
              onChange={e => setAttributeValue(e.target.value)}
              className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
              required
              placeholder={valueType === 'URL' ? 'https://example.com' : 'Value'}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="hover:bg-green-700 disabled:bg-green-400 bg-green-600 rounded px-4 py-2 text-white transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Add Property'}
        </button>
      </form>
    </div>
  );
}

// Component to add a relation between entities
function AddRelationForm({ entityId }: { entityId: EntityId }) {
  const { entity, operations } = useEntity(entityId);
  const [targetEntityId, setTargetEntityId] = useState('');
  const [relationType, setRelationType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { entities } = useEntities([
    'entity1' as unknown as EntityId,
    'entity2' as unknown as EntityId,
    'entity3' as unknown as EntityId,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operations || !entity) return;

    setIsSubmitting(true);
    const relationId = `relation_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as unknown as EntityId;
    const relationTypeId =
      `relationType_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as unknown as EntityId;

    // Look up the target entity name if possible
    const targetEntity = Object.values(entities).find(e => e?.id === EntityId(targetEntityId));

    const newRelation: Relation = {
      space: 'space1',
      id: relationId,
      index: '0',
      typeOf: {
        id: relationTypeId,
        name: relationType,
      },
      fromEntity: {
        id: entity.id,
        name: entity.name || '',
      },
      toEntity: {
        id: EntityId(targetEntityId),
        name: targetEntity?.name || 'Unknown Entity',
        renderableType: 'TEXT',
        value: targetEntity?.name || 'Unknown Entity',
      },
    };

    operations.setRelation(newRelation);

    // Reset form after submission
    setTargetEntityId('');
    setRelationType('');
    setIsSubmitting(false);
  };

  if (!entity) return null;

  // Get available entities to link to (excluding the current entity)
  const availableEntities = Object.entries(entities)
    .filter(([id, e]) => e && e.id !== entityId)
    .map(([id, e]) => ({ id, name: e?.name || 'Unnamed' }));

  return (
    <div className="shadow-sm rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-lg font-medium">Add Relation</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Relation Type:</label>
          <input
            type="text"
            value={relationType}
            onChange={e => setRelationType(e.target.value)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            required
            placeholder="e.g. Has Employee, Located In"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Target Entity:</label>
          <select
            value={targetEntityId}
            onChange={e => setTargetEntityId(e.target.value)}
            className="focus:border-blue-500 focus:ring-blue-500 w-full rounded border p-2"
            required
          >
            <option value="">-- Select Target Entity --</option>
            {availableEntities.map(e => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.id})
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !targetEntityId}
          className="hover:bg-green-700 disabled:bg-green-400 bg-green-600 rounded px-4 py-2 text-white transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Add Relation'}
        </button>
      </form>
    </div>
  );
}

// Enhanced entity viewer component
function EnhancedEntityViewer({ entityId }: { entityId: EntityId }) {
  const { entity, isLoading, error, operations } = useEntity(entityId);
  const [activeTab, setActiveTab] = useState<'properties' | 'relations'>('properties');
  const [showAddForm, setShowAddForm] = useState<'property' | 'relation' | null>(null);

  if (isLoading) {
    return (
      <div className="shadow-sm rounded-lg border bg-white p-4 text-center">
        <div className="flex animate-pulse space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="bg-gray-200 mx-auto h-4 w-3/4 rounded"></div>
            <div className="space-y-2">
              <div className="bg-gray-200 h-4 rounded"></div>
              <div className="bg-gray-200 h-4 w-5/6 rounded"></div>
            </div>
          </div>
        </div>
        <div className="text-gray-500 mt-2 text-sm">Loading entity data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-700 bg-red-50 border-red-200 rounded-lg border p-4">
        <h3 className="font-medium">Error loading entity</h3>
        <p className="mt-1 text-sm">{error.message}</p>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="text-yellow-700 bg-yellow-50 border-yellow-200 rounded-lg border p-4">
        <h3 className="font-medium">Entity not found</h3>
        <p className="mt-1 text-sm">The requested entity could not be found or has been deleted.</p>
      </div>
    );
  }

  return (
    <div className="shadow-sm overflow-hidden rounded-lg border bg-white">
      {/* Entity header */}
      <div className="bg-gray-50 border-b p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{entity.name || 'Unnamed Entity'}</h2>
            <p className="text-gray-600 mt-1 text-sm">{entity.description || 'No description'}</p>

            <div className="mt-2 flex flex-wrap gap-1">
              {entity.types.map((type, i) => (
                <span key={i} className="bg-gray-200 rounded-full px-2 py-1 text-xs">
                  {type.name || 'Unknown Type'}
                </span>
              ))}
              <span className="text-blue-800 bg-blue-100 rounded-full px-2 py-1 text-xs">
                ID: {entity.id as string}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => operations?.refresh()}
              className="hover:bg-blue-100 bg-blue-50 text-blue-600 rounded-md px-3 py-1.5 text-sm"
            >
              Refresh
            </button>
            <button
              onClick={() => operations?.deleteEntity()}
              className="hover:bg-red-100 bg-red-50 text-red-600 rounded-md px-3 py-1.5 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'properties'
              ? 'text-blue-600 border-blue-500 border-b-2'
              : 'hover:text-gray-700 text-gray-500'
          }`}
          onClick={() => setActiveTab('properties')}
        >
          Properties ({entity.triples.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'relations' ? 'text-blue-600 border-blue-500 border-b-2' : 'hover:text-gray-700 text-gray-500'
          }`}
          onClick={() => setActiveTab('relations')}
        >
          Relations ({entity.relationsOut.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'properties' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium">Properties</h3>
              <button
                onClick={() => setShowAddForm(showAddForm === 'property' ? null : 'property')}
                className="hover:bg-green-100 bg-green-50 text-green-600 rounded-md px-3 py-1 text-sm"
              >
                {showAddForm === 'property' ? 'Cancel' : '+ Add Property'}
              </button>
            </div>

            {showAddForm === 'property' ? (
              <AddTripleForm entityId={entityId} />
            ) : (
              <TriplesList
                triples={entity.triples}
                onDelete={operations ? triple => operations.deleteTriple(triple) : undefined}
              />
            )}
          </div>
        )}

        {activeTab === 'relations' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium">Relations</h3>
              <button
                onClick={() => setShowAddForm(showAddForm === 'relation' ? null : 'relation')}
                className="hover:bg-green-100 bg-green-50 text-green-600 rounded-md px-3 py-1 text-sm"
              >
                {showAddForm === 'relation' ? 'Cancel' : '+ Add Relation'}
              </button>
            </div>

            {showAddForm === 'relation' ? (
              <AddRelationForm entityId={entityId} />
            ) : (
              <RelationsList
                relations={entity.relationsOut}
                entityId={entityId}
                onDelete={operations ? relation => operations.deleteRelation(relation) : undefined}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component to display and work with a list of entities
function EntityList() {
  const entityIds = [
    'entity1' as unknown as EntityId,
    'entity2' as unknown as EntityId,
    'entity3' as unknown as EntityId,
  ];

  const { entities, loading, errors, operations, refreshAll } = useEntities(entityIds);
  const [selectedEntityId, setSelectedEntityId] = useState<EntityId | null>(null);

  return (
    <div className="shadow-sm mb-4 rounded-lg border bg-white p-4">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Entity Explorer</h2>
        <button
          onClick={refreshAll}
          className="hover:bg-blue-700 bg-blue-600 rounded px-4 py-2 text-white transition-colors"
        >
          Sync All Entities
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {entityIds.map(id => {
          const entity = entities[id as string];
          const isLoading = loading[id as string];
          const error = errors[id as string];

          return (
            <div key={id as string} className="shadow-sm rounded border p-4">
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="bg-gray-200 mb-2 h-5 w-3/4 rounded"></div>
                  <div className="bg-gray-200 mb-1 h-4 rounded"></div>
                  <div className="bg-gray-200 mb-3 h-4 w-1/2 rounded"></div>
                </div>
              ) : error ? (
                <div className="text-red-500">Error: {error.message}</div>
              ) : !entity ? (
                <div>Entity not found</div>
              ) : (
                <>
                  <h3 className="text-lg font-medium">{entity.name}</h3>
                  <p className="text-gray-600 mb-2 text-sm">{entity.description}</p>

                  <div className="mb-2">
                    <span className="bg-gray-200 rounded px-2 py-1 text-xs">
                      {entity.types.map(t => t.name).join(', ')}
                    </span>
                  </div>

                  {/* Preview of properties */}
                  {entity.triples.length > 0 && (
                    <div className="mt-3">
                      <div className="text-gray-500 mb-1 text-xs font-medium uppercase">Properties</div>
                      {entity.triples.slice(0, 2).map((triple, i) => (
                        <div key={i} className="flex py-1 text-sm">
                          <span className="w-1/3 font-medium">{triple.attributeName}:</span>
                          <span className="text-gray-700">{triple.value.value}</span>
                        </div>
                      ))}
                      {entity.triples.length > 2 && (
                        <div className="text-gray-500 mt-1 text-xs">+{entity.triples.length - 2} more properties</div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex space-x-2">
                    <button
                      onClick={() => setSelectedEntityId(id)}
                      className="hover:bg-blue-600 bg-blue-500 rounded px-2 py-1 text-sm text-white"
                    >
                      View Details
                    </button>

                    <button
                      onClick={() => operations[id as string]?.deleteEntity()}
                      className="hover:bg-red-600 bg-red-500 rounded px-2 py-1 text-sm text-white"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h3 className="mb-4 text-lg font-semibold">Entity Details View</h3>

        <div className="bg-gray-50 mb-4 rounded-lg p-4">
          <div className="mb-2 text-sm">Select an entity to view and edit its detailed information:</div>
          <div className="flex flex-wrap gap-2">
            {entityIds.map(id => {
              const entity = entities[id as string];
              return (
                <button
                  key={id as string}
                  onClick={() => setSelectedEntityId(id)}
                  className={`hover:bg-gray-300 rounded-md px-3 py-1.5 text-sm ${
                    selectedEntityId === id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  {entity?.name || (id as string)}
                </button>
              );
            })}
          </div>
        </div>

        {selectedEntityId && <EnhancedEntityViewer entityId={selectedEntityId} />}
      </div>
    </div>
  );
}

// Component to show all entities in the store
function AllEntitiesView() {
  const { store } = useSyncEngine();
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<EntityId | null>(null);

  // Refresh entity list
  const refreshEntityList = useCallback(() => {
    setIsLoading(true);
    // Small delay to simulate loading
    setTimeout(() => {
      const entities = store.getAllEntities();
      setAllEntities(entities);
      setIsLoading(false);
    }, 300);
  }, [store]);

  // Load entities on mount and when store changes
  useEffect(() => {
    refreshEntityList();

    // Subscribe to store events for real-time updates
    const unsubscribeUpdated = store.subscribe(EntityStore.ENTITY_UPDATED, refreshEntityList);
    const unsubscribeDeleted = store.subscribe(EntityStore.ENTITY_DELETED, refreshEntityList);
    const unsubscribeTriples = store.subscribe(EntityStore.TRIPLES_UPDATED, refreshEntityList);
    const unsubscribeRelations = store.subscribe(EntityStore.RELATIONS_UPDATED, refreshEntityList);

    return () => {
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeTriples();
      unsubscribeRelations();
    };
  }, [store, refreshEntityList]);

  return (
    <div className="shadow-sm mb-8 rounded-lg border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">All Entities</h2>
        <button
          onClick={refreshEntityList}
          className="hover:bg-blue-100 bg-blue-50 text-blue-600 rounded-md px-3 py-1 text-sm"
        >
          Refresh List
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="animate-pulse space-y-4">
            <div className="bg-gray-200 mx-auto h-4 w-1/4 rounded"></div>
            <div className="bg-gray-200 mx-auto h-4 w-1/2 rounded"></div>
            <div className="bg-gray-200 mx-auto h-4 w-1/3 rounded"></div>
          </div>
          <p className="text-gray-500 mt-4 text-sm">Loading entities...</p>
        </div>
      ) : allEntities.length === 0 ? (
        <div className="text-gray-500 py-8 text-center">
          <p>No entities found in the store.</p>
          <p className="mt-2 text-sm">Create some entities to see them listed here.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="divide-gray-200 min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">ID</th>
                  <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Properties
                  </th>
                  <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Relations
                  </th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-gray-200 divide-y bg-white">
                {allEntities.map(entity => (
                  <tr key={entity.id as string} className="hover:bg-gray-50">
                    <td className="text-gray-500 whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {entity.id as string}
                    </td>
                    <td className="text-gray-900 px-4 py-3 text-sm font-medium">{entity.name || 'Unnamed'}</td>
                    <td className="px-4 py-3">
                      {entity.types.map((type, idx) => (
                        <span
                          key={idx}
                          className="bg-gray-100 text-gray-700 mr-1 inline-block rounded px-2 py-1 text-xs"
                        >
                          {type.name}
                        </span>
                      ))}
                    </td>
                    <td className="text-gray-500 px-4 py-3 text-sm">{entity.triples.length}</td>
                    <td className="text-gray-500 px-4 py-3 text-sm">{entity.relationsOut.length}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEntity(entity.id)}
                        className="hover:bg-blue-600 bg-blue-500 rounded px-2 py-1 text-xs text-white"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedEntity && (
            <div className="mt-6 border-t pt-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium">Entity Details</h3>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="hover:bg-gray-200 text-gray-600 rounded px-2 py-1 text-sm"
                >
                  Close
                </button>
              </div>
              <EnhancedEntityViewer entityId={selectedEntity} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Relation Visualization to show how updates propagate
function RelationsPropagationDemo() {
  const { entities, loading, operations } = useEntities([
    'entity1' as unknown as EntityId,
    'entity2' as unknown as EntityId,
    'entity3' as unknown as EntityId,
  ]);

  const [showInstructions, setShowInstructions] = useState(true);

  // Check if we have a relationship from entity1 to entity2
  const hasCompanyToPersonRelation = useMemo(() => {
    const company = entities['entity1' as string];
    return company?.relationsOut.some(
      r =>
        r.fromEntity.id === ('entity1' as unknown as EntityId) && r.toEntity.id === ('entity2' as unknown as EntityId)
    );
  }, [entities]);

  // Function to update the person's name
  const updatePersonName = useCallback(() => {
    const person = entities['entity2' as string];
    if (person && operations['entity2' as string]) {
      const newName = `${person.name} (Updated ${new Date().toLocaleTimeString()})`;
      operations['entity2']?.updateEntity({
        ...person,
        name: newName,
      });
    }
  }, [entities, operations]);

  if (loading['entity1' as string] || loading['entity2' as string]) {
    return (
      <div className="shadow-sm mb-8 rounded-lg border bg-white p-4">
        <div className="animate-pulse space-y-4 py-8 text-center">
          <div className="bg-gray-200 mx-auto h-4 w-1/3 rounded"></div>
          <div className="bg-gray-200 mx-auto h-4 w-1/2 rounded"></div>
        </div>
        <p className="text-gray-500 text-center text-sm">Loading relation data...</p>
      </div>
    );
  }

  return (
    <div className="shadow-sm mb-8 rounded-lg border bg-white">
      <div className="border-b p-4">
        <h2 className="text-xl font-semibold">Relation Updates Demonstration</h2>
        <p className="text-gray-600 mt-1 text-sm">
          See how updating an entity automatically updates its references in relations
        </p>
      </div>

      {showInstructions && (
        <div className="bg-yellow-50 border-yellow-100 border-y p-4">
          <div className="flex justify-between">
            <h3 className="text-yellow-800 font-medium">How to test relation propagation</h3>
            <button onClick={() => setShowInstructions(false)} className="text-yellow-600 text-sm">
              Hide
            </button>
          </div>
          <ol className="text-yellow-700 ml-5 mt-2 list-decimal space-y-1 text-sm">
            <li>First ensure the "Company" entity has a relation to the "Person" entity</li>
            <li>Then click the "Update Person Name" button to change the target entity</li>
            <li>Notice how the relation in Company is immediately updated to show the new name</li>
            <li>This demonstrates automatic propagation of changes through relations</li>
          </ol>
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Company Entity Card */}
          <div className="flex-1 rounded-lg border p-4">
            <h3 className="mb-2 text-lg font-medium">{entities['entity1' as string]?.name || 'Company'}</h3>

            <div className="mt-3 border-t pt-3">
              <h4 className="mb-2 font-medium">Relations:</h4>
              {entities['entity1' as string]?.relationsOut.length === 0 ? (
                <div className="text-gray-500 text-sm italic">No relations</div>
              ) : (
                <div className="space-y-2">
                  {entities['entity1' as string]?.relationsOut.map((relation, idx) => (
                    <div key={idx} className="bg-gray-50 rounded border p-2">
                      <div className="flex items-center">
                        <span className="text-sm font-medium">{relation.typeOf.name}:</span>
                        <span className="text-blue-600 ml-2 text-sm">{relation.toEntity.name}</span>
                      </div>
                      <div className="text-gray-500 mt-1 text-xs">Target ID: {relation.toEntity.id as string}</div>
                    </div>
                  ))}
                </div>
              )}

              {!hasCompanyToPersonRelation && (
                <div className="mt-3">
                  <div className="bg-amber-50 border-amber-200 text-amber-700 rounded border p-2 text-sm">
                    This entity needs a relation to "Person" to demonstrate updates.
                  </div>
                  <button
                    onClick={() => {
                      if (
                        operations['entity1' as string] &&
                        entities['entity1' as string] &&
                        entities['entity2' as string]
                      ) {
                        operations['entity1' as string]?.setRelation({
                          space: 'space1',
                          id: `relation_${Date.now()}` as unknown as EntityId,
                          index: '0',
                          typeOf: {
                            id: 'employeeRelation' as unknown as EntityId,
                            name: 'Has Employee',
                          },
                          fromEntity: {
                            id: 'entity1' as unknown as EntityId,
                            name: entities['entity1' as string]?.name || 'Company',
                          },
                          toEntity: {
                            id: 'entity2' as unknown as EntityId,
                            name: entities['entity2' as string]?.name || 'Person',
                            renderableType: 'TEXT',
                            value: entities['entity2' as string]?.name || 'Person',
                          },
                        });
                      }
                    }}
                    className="hover:bg-green-600 bg-green-500 mt-2 rounded px-2 py-1 text-sm text-white"
                  >
                    Add Relation to Person
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Person Entity Card */}
          <div className="flex-1 rounded-lg border p-4">
            <h3 className="mb-2 text-lg font-medium">{entities['entity2' as string]?.name || 'Person'}</h3>

            <div className="mt-3 border-t pt-3">
              <h4 className="mb-2 font-medium">Properties:</h4>
              {entities['entity2' as string]?.triples.length === 0 ? (
                <div className="text-gray-500 text-sm italic">No properties</div>
              ) : (
                <div className="space-y-2">
                  {entities['entity2' as string]?.triples.map((triple, idx) => (
                    <div key={idx} className="border-b pb-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{triple.attributeName}:</span>
                        <span className="text-sm">{triple.value.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={updatePersonName}
                  className="hover:bg-blue-600 bg-blue-500 w-full rounded px-3 py-2 text-sm text-white"
                >
                  Update Person Name
                </button>
                <p className="text-gray-500 mt-2 text-center text-xs">
                  When you update this entity, any relations referring to it will automatically update
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-4">
          <h3 className="mb-3 text-lg font-medium">What's happening:</h3>
          <ol className="text-gray-700 ml-5 list-decimal space-y-2 text-sm">
            <li>When you update the Person entity's name, the change is immediately applied locally</li>
            <li>The sync engine detects that this entity is referenced in a relation from Company</li>
            <li>It automatically updates the relation reference with the new name</li>
            <li>All of this happens optimistically before any server sync</li>
            <li>In the background, the changes are synchronized with the "remote" source</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Main page component
export default function SyncEngineDemoPage() {
  return (
    <SyncEngineProvider initialData={mockInitialData}>
      <div className="bg-gray-50 mx-auto min-h-screen max-w-6xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-bold">Entity Sync Engine</h1>
        <div className="text-blue-700 bg-blue-50 border-blue-200 mb-8 rounded-lg border p-4">
          <h2 className="text-blue-800 mb-2 text-lg font-semibold">About this demo</h2>
          <p className="text-blue-700 mb-2">
            This page demonstrates a sync engine with optimistic updates and automatic relation reference handling. All
            changes are applied immediately in the UI while being synchronized in the background.
          </p>
          <ul className="text-blue-600 ml-2 list-inside list-disc text-sm">
            <li>Create new entities with properties</li>
            <li>Add, edit, and delete properties (triples)</li>
            <li>Create relations between entities</li>
            <li>Watch as related entities automatically update when referenced entities change</li>
            <li>All operations are optimistic first, then synced to the "remote" source</li>
          </ul>
        </div>

        <AllEntitiesView />
        <EntitySearch />
        <RelationsPropagationDemo />
        <CreateEntityForm />
        <EntityList />
      </div>
    </SyncEngineProvider>
  );
}
