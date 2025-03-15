import { useState } from 'react';

import { Entity } from '~/core/io/dto/entities';

import { createQueryBuilder } from './query-layer';
import { EntityStore } from './sync-engine';
import { useSyncEngine } from './use-sync-engine';

// Different search modes
type SearchMode = 'basic' | 'name' | 'description' | 'property' | 'relation' | 'type' | 'advanced';

// Search component
export default function EntitySearch() {
  const { store } = useSyncEngine();
  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('basic');
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [propertyName, setPropertyName] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [relationType, setRelationType] = useState('');
  const [typeName, setTypeName] = useState('');
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  // Execute search based on current mode and query
  const executeSearch = async () => {
    if (!searchText && searchMode === 'basic') return;

    console.log('executing');

    setIsSearching(true);
    setError(null);
    setSearchResults([]);

    try {
      const queryBuilder = createQueryBuilder(store);
      let results: Entity[] = [];

      switch (searchMode) {
        case 'basic':
          // Search across name, description, and property values
          results = await queryBuilder.search(searchText);
          break;

        case 'name':
          // Search by name only
          results = await queryBuilder.findByName(searchText);
          break;

        case 'description':
          // Search by description only
          results = await queryBuilder.query().whereDescription({ contains: searchText }).execute();
          break;

        case 'property':
          // Search by property name and optionally value
          results = await queryBuilder.findByProperty(propertyName, propertyValue ? propertyValue : undefined);
          break;

        case 'relation':
          // Search by relation type
          results = await queryBuilder.findByRelationType(relationType);
          break;

        case 'type':
          // Search by entity type
          results = await queryBuilder.findByType(typeName);
          break;

        case 'advanced':
          // Parse and execute advanced query
          try {
            // Simple parsing for demonstration
            // Format: field:value AND/OR field:value
            // Example: "name:company AND property:location:San Francisco"
            const query = parseAdvancedQuery(advancedQuery);
            results = await executeAdvancedQuery(query, store);
          } catch (err) {
            setError(`Invalid query format: ${err instanceof Error ? err.message : String(err)}`);
            results = [];
          }
          break;
      }

      setSearchResults(results);
    } catch (err) {
      setError(`Search error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="shadow-sm rounded-lg border bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Entity Search</h2>

      {/* Search mode tabs */}
      <div className="mb-4 flex flex-wrap border-b">
        {(['basic', 'name', 'description', 'property', 'relation', 'type', 'advanced'] as SearchMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setSearchMode(mode)}
            className={`mb-1 mr-1 px-3 py-2 text-sm ${
              searchMode === mode
                ? 'border-blue-500 text-blue-600 border-b-2 font-medium'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Search inputs based on mode */}
      <div className="mb-6">
        {searchMode === 'basic' && (
          <div className="flex">
            <input
              type="text"
              placeholder="Search across all fields..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="focus:ring-blue-500 flex-1 rounded-l-md border px-4 py-2 focus:outline-none focus:ring-2"
            />
            <button
              onClick={executeSearch}
              disabled={isSearching || !searchText}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {searchMode === 'name' && (
          <div className="flex">
            <input
              type="text"
              placeholder="Search by entity name..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="focus:ring-blue-500 flex-1 rounded-l-md border px-4 py-2 focus:outline-none focus:ring-2"
            />
            <button
              onClick={executeSearch}
              disabled={isSearching || !searchText}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {searchMode === 'description' && (
          <div className="flex">
            <input
              type="text"
              placeholder="Search in entity descriptions..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="focus:ring-blue-500 flex-1 rounded-l-md border px-4 py-2 focus:outline-none focus:ring-2"
            />
            <button
              onClick={executeSearch}
              disabled={isSearching || !searchText}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {searchMode === 'property' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Property Name:</label>
              <input
                type="text"
                placeholder="e.g. 'role', 'location', etc."
                value={propertyName}
                onChange={e => setPropertyName(e.target.value)}
                className="focus:ring-blue-500 w-full rounded border px-4 py-2 focus:outline-none focus:ring-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Property Value (optional):</label>
              <input
                type="text"
                placeholder="Leave empty to find any value"
                value={propertyValue}
                onChange={e => setPropertyValue(e.target.value)}
                className="focus:ring-blue-500 w-full rounded border px-4 py-2 focus:outline-none focus:ring-2"
              />
            </div>

            <button
              onClick={executeSearch}
              disabled={isSearching || !propertyName}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search Properties'}
            </button>
          </div>
        )}

        {searchMode === 'relation' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Relation Type:</label>
              <input
                type="text"
                placeholder="e.g. 'Has Employee', 'Located In', etc."
                value={relationType}
                onChange={e => setRelationType(e.target.value)}
                className="focus:ring-blue-500 w-full rounded border px-4 py-2 focus:outline-none focus:ring-2"
              />
            </div>

            <button
              onClick={executeSearch}
              disabled={isSearching || !relationType}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search Relations'}
            </button>
          </div>
        )}

        {searchMode === 'type' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Entity Type:</label>
              <input
                type="text"
                placeholder="e.g. 'Person', 'Organization', etc."
                value={typeName}
                onChange={e => setTypeName(e.target.value)}
                className="focus:ring-blue-500 w-full rounded border px-4 py-2 focus:outline-none focus:ring-2"
              />
            </div>

            <button
              onClick={executeSearch}
              disabled={isSearching || !typeName}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Search Types'}
            </button>
          </div>
        )}

        {searchMode === 'advanced' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Advanced Query:</label>
              <textarea
                placeholder="name:company AND property:location:San Francisco"
                value={advancedQuery}
                onChange={e => setAdvancedQuery(e.target.value)}
                rows={3}
                className="focus:ring-blue-500 w-full rounded border px-4 py-2 focus:outline-none focus:ring-2"
              />
            </div>

            <div className="text-gray-500 text-xs">
              <p>Query format: field:value AND/OR field:value</p>
              <p>Supported fields: name, description, type, property, relation</p>
              <p>Example: name:company AND property:location:San Francisco</p>
            </div>

            <button
              onClick={executeSearch}
              disabled={isSearching || !advancedQuery}
              className="rounded-r-md bg-ctaPrimary px-4 py-2 text-white"
            >
              {isSearching ? 'Searching...' : 'Execute Query'}
            </button>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <div className="bg-red-50 text-red-700 border-red-200 mb-4 rounded border p-3">{error}</div>}

      {/* Search results */}
      <div>
        <h3 className="mb-3 text-lg font-medium">
          Results {searchResults.length > 0 ? `(${searchResults.length})` : ''}
        </h3>

        {isSearching ? (
          <div className="py-10 text-center">
            <div className="border-blue-500 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-t-2"></div>
            <p className="text-gray-600 mt-2">Searching...</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-gray-500 py-10 text-center">
            <p>No results found.</p>
            <p className="mt-1 text-sm">Try a different search term or mode.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results list */}
            <div className="overflow-hidden rounded-lg border">
              <table className="divide-gray-200 min-w-full divide-y">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Type
                    </th>
                    <th className="text-gray-500 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Properties
                    </th>
                    <th className="w-16 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-gray-200 divide-y bg-white">
                  {searchResults.map(entity => (
                    <tr key={entity.id as string} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-medium">{entity.name || 'Unnamed'}</div>
                        <div className="text-gray-500 max-w-xs truncate text-sm">
                          {entity.description || 'No description'}
                        </div>
                      </td>
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
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedEntity(entity)}
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

            {/* Selected entity details */}
            {selectedEntity && (
              <div className="border-blue-100 bg-blue-50 mt-6 rounded-lg border p-4">
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="text-blue-800 text-lg font-medium">{selectedEntity.name || 'Unnamed Entity'}</h3>
                  <button onClick={() => setSelectedEntity(null)} className="text-blue-600 hover:text-blue-800 text-sm">
                    Close
                  </button>
                </div>

                <div className="mb-3">
                  <p className="text-blue-700">{selectedEntity.description || 'No description'}</p>
                  <p className="text-blue-600 mt-1 text-sm">ID: {selectedEntity.id as string}</p>
                </div>

                {/* Entity properties */}
                <div className="mb-4">
                  <h4 className="text-blue-800 mb-2 font-medium">Properties:</h4>
                  {selectedEntity.triples.length === 0 ? (
                    <p className="text-blue-600 text-sm italic">No properties</p>
                  ) : (
                    <div className="border-blue-200 overflow-hidden rounded border bg-white">
                      <table className="divide-blue-100 min-w-full divide-y">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="text-blue-800 px-3 py-2 text-left text-xs font-medium">Property</th>
                            <th className="text-blue-800 px-3 py-2 text-left text-xs font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-blue-100 divide-y">
                          {selectedEntity.triples.map((triple, index) => (
                            <tr key={index} className="hover:bg-blue-50">
                              <td className="text-blue-700 px-3 py-2 text-sm font-medium">{triple.attributeName}</td>
                              <td className="text-blue-600 px-3 py-2 text-sm">{triple.value.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Entity relations */}
                <div>
                  <h4 className="text-blue-800 mb-2 font-medium">Relations:</h4>
                  {selectedEntity.relationsOut.length === 0 ? (
                    <p className="text-blue-600 text-sm italic">No relations</p>
                  ) : (
                    <div className="border-blue-200 overflow-hidden rounded border bg-white">
                      <table className="divide-blue-100 min-w-full divide-y">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="text-blue-800 px-3 py-2 text-left text-xs font-medium">Type</th>
                            <th className="text-blue-800 px-3 py-2 text-left text-xs font-medium">Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-blue-100 divide-y">
                          {selectedEntity.relationsOut.map((relation, index) => (
                            <tr key={index} className="hover:bg-blue-50">
                              <td className="text-blue-700 px-3 py-2 text-sm font-medium">{relation.typeOf.name}</td>
                              <td className="text-blue-600 px-3 py-2 text-sm">{relation.toEntity.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Advanced query parsing
interface AdvancedQueryPart {
  field: string;
  value: string;
  subvalue?: string;
  operator?: 'AND' | 'OR';
}

// Parse advanced query string into structured query parts
function parseAdvancedQuery(query: string): AdvancedQueryPart[] {
  const parts: AdvancedQueryPart[] = [];

  // Split by AND or OR operators
  const segments = query.split(/\s+(AND|OR)\s+/);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();

    // If this is an operator
    if (segment === 'AND' || segment === 'OR') {
      if (parts.length > 0) {
        parts[parts.length - 1].operator = segment;
      }
      continue;
    }

    // Parse field:value format
    const colonIndex = segment.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid segment format: ${segment}`);
    }

    const field = segment.substring(0, colonIndex).trim();
    const valueStr = segment.substring(colonIndex + 1).trim();

    // Handle property:name:value format
    if (field === 'property' && valueStr.includes(':')) {
      const [propName, propValue] = valueStr.split(':');
      parts.push({
        field,
        value: propName,
        subvalue: propValue,
      });
    } else {
      parts.push({
        field,
        value: valueStr,
      });
    }
  }

  return parts;
}

// Execute advanced query
async function executeAdvancedQuery(query: AdvancedQueryPart[], store: EntityStore): Promise<Entity[]> {
  const queryBuilder = createQueryBuilder(store);
  let baseQuery = queryBuilder.query();

  // Handle the first query part
  if (query.length > 0) {
    const firstPart = query[0];
    baseQuery = applyQueryPart(baseQuery, firstPart);

    // Handle subsequent parts with operators
    for (let i = 1; i < query.length; i++) {
      const part = query[i];
      const prevOperator = query[i - 1].operator || 'AND';

      if (prevOperator === 'AND') {
        baseQuery = applyQueryPart(baseQuery, part);
      } else if (prevOperator === 'OR') {
        // For OR, we need to create a separate query and combine with orWhere
        baseQuery = baseQuery.orWhere([createConditionFromPart(part)]);
      }
    }
  }

  return baseQuery.execute();
}

// Apply a query part to the query builder
function applyQueryPart(query: any, part: AdvancedQueryPart): any {
  switch (part.field) {
    case 'name':
      return query.whereName({ contains: part.value });

    case 'description':
      return query.whereDescription({ contains: part.value });

    case 'type':
      return query.whereType({ name: { contains: part.value } });

    case 'property':
      return query.whereTriple({
        attributeName: { contains: part.value },
        value: part.subvalue ? { contains: part.subvalue } : undefined,
      });

    case 'relation':
      return query.whereRelation({
        typeOf: { name: { contains: part.value } },
      });

    default:
      throw new Error(`Unknown field: ${part.field}`);
  }
}

// Create a condition object from a query part
function createConditionFromPart(part: AdvancedQueryPart): any {
  switch (part.field) {
    case 'name':
      return { name: { contains: part.value } };

    case 'description':
      return { description: { contains: part.value } };

    case 'type':
      return { types: [{ name: { contains: part.value } }] };

    case 'property':
      return {
        triples: {
          attributeName: { contains: part.value },
          value: part.subvalue ? { contains: part.subvalue } : undefined,
        },
      };

    case 'relation':
      return {
        relations: {
          typeOf: { name: { contains: part.value } },
        },
      };

    default:
      throw new Error(`Unknown field: ${part.field}`);
  }
}
