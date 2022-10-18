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

    return createTripleWithId('', mappedEntityId, mappedAttributeId, mappedValue);
  });

  return unique(triples);
}

export function convertHealthData(csv: string) {
  type HealthDataRow = {
    ID_content: string;
    'Title/Fact': string;
    Content: string;
    'Entity ID \n(Source)': string;
    Source: string;
    'Entity ID \n(Guest1)': string;
    'Source\n(Guest1)': string;
    'Entity ID \n(Guest2)': string;
    'Source\n(Guest2)': string;
    'Entity ID \n(Guest3)': string;
    'Source\n(Guest3)': string;
    ID_all_guest: string;
    'Entity ID \n(Location)': string;
    SourceLoc: string;
    'Entity ID \n(Category)': string;
    Category: string;
    'Entity ID \n(Platform)': string;
    'Platform/Site': string;
    Date: string;
    ID_Tag1: string;
    Tag1: string;
    ID_Tag2: string;
    Tag2: string;
    ID_Tag3: string;
    Tag3: string;
    ID_Tag4: string;
    Tag4: string;
    ID_Tag5: string;
    Tag5: string;
    ID_Tag6: string;
    Tag6: string;
    ID_Tag7: string;
    Tag7: string;
    ID_Tag8: string;
    Tag8: string;
    ID_Tag9: string;
    Tag9: string;
    ID_Tag10: string;
    Tag10: string;
    ID_Tag11: string;
    Tag11: string;
    ID_all_tags0: string;
    ID_all_tags: string;
    'UNIQUE TAGS': string;
    Tags: string;
    'All tags': string;
  };

  const results = parseCSV<HealthDataRow>(csv, { header: true });

  const attributeRows: EavRow[] = [
    ['content', 'type', 'type'],
    ['content', 'name', 'Content'],
    ['source', 'type', 'type'],
    ['source', 'name', 'Source'],
    ['source location', 'type', 'type'],
    ['source location', 'name', 'Source Location'],
    ['category', 'type', 'type'],
    ['category', 'name', 'Category'],
  ];

  function toEavRow(row: HealthDataRow): EavRow[] {
    return [
      [row.ID_content, 'content', row.Content],
      [row.ID_content, 'source', row['Entity ID \n(Source)']],
      [row.ID_content, 'source location', row['Entity ID \n(Location)']],
      [row.ID_content, 'category', row['Entity ID \n(Category)']],
      [row['Entity ID \n(Source)'], 'name', row.Source],
      [row['Entity ID \n(Location)'], 'name', row.SourceLoc],
      [row['Entity ID \n(Category)'], 'name', row.Category],
    ];
  }

  const eavRows = results.data.flatMap(toEavRow);

  return [...attributeRows, ...eavRows];
}

export async function importCSVFile(file: File, createId: CreateUuid = createEntityId): Promise<Triple[]> {
  const csv = await readFileAsText(file);
  const rows = file.name === 'healthdata.csv' ? convertHealthData(csv) : readCSV(csv);
  return eavRowsToTriples(rows, createId);
}
