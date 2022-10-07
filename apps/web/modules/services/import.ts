import { parse as parseCSV } from 'papaparse';
import { Triple, Value } from '../types';
import { BUILTIN_ENTITY_IDS, createEntityId, createTripleWithId, isValidEntityId } from './create-id';

export function readFileAsText(file: File) {
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.addEventListener('load', event => {
      const data = event.target!.result;
      resolve(data as string);
    });
    reader.readAsText(file);
  });
}

type CreateUuid = (value: string) => string;

export type EavRow = [string, string, string];

function readCSV(csv: string): EavRow[] {
  const results = parseCSV<string[]>(csv);

  const rows = results.data.slice(1);

  if (rows.some(row => row.length < 3)) {
    throw new Error('Each row must have 3 cells');
  }

  return rows as EavRow[];
}

function unique(triples: Triple[]): Triple[] {
  return Object.values(Object.fromEntries(triples.map(triple => [triple.id, triple])));
}

export function eavRowsToTriples(rows: EavRow[], createId: CreateUuid = createEntityId): Triple[] {
  // Create a collection of all known entity ids
  const entityIds = new Set([
    ...BUILTIN_ENTITY_IDS,
    ...rows.flatMap(([entityId, attributeId]) => [entityId, attributeId]),
  ]);

  // Ensure entity ids are either valid uuids or builtins
  const entityIdMap = Object.fromEntries([...entityIds].map(id => [id, isValidEntityId(id) ? id : createId(id)]));

  // Create triples, attempting to detect entity references
  const triples = rows.map((row): Triple => {
    const [entityId, attributeId, value] = row;

    const mappedEntityId = entityIdMap[entityId];
    const mappedAttributeId = entityIdMap[attributeId];
    const mappedValue: Value =
      value in entityIdMap ? { type: 'entity', value: entityIdMap[value] } : { type: 'string', value };

    return createTripleWithId(mappedEntityId, mappedAttributeId, mappedValue);
  });

  return unique(triples);
}

export async function importCSVFile(file: File, createId: CreateUuid = createEntityId): Promise<Triple[]> {
  const csv = await readFileAsText(file);
  const rows = readCSV(csv);
  return eavRowsToTriples(rows, createId);
}
