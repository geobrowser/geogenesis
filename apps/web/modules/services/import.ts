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

function createValueId(value: Value): string {
  switch (value.type) {
    case 'entity':
      return `e~${value.id}`;
    case 'string':
      return `s~${value.value}`;
    case 'number':
      return `n~${value.value}`;
  }
}

function createTripleIdUnique(triple: Triple): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}:${createValueId(triple.value)}`;
}

export function unique(triples: Triple[]): Triple[] {
  return Object.values(Object.fromEntries(triples.map(triple => [createTripleIdUnique(triple), triple])));
}

export function eavRowsToTriples(rows: EavRow[], space: string, createId: CreateUuid = createEntityId): Triple[] {
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
      value in entityIdMap
        ? { type: 'entity', id: entityIdMap[value] }
        : { type: 'string', id: createId(value), value };

    return createTripleWithId(space, mappedEntityId, mappedAttributeId, mappedValue);
  });

  return unique(triples);
}

type ConvertHealthDataOptions = { rowCount?: number; shouldIncludeSections?: boolean };

export function convertHealthFacts(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  // Since we can have many columns with the same name (many-to-many relationships) we can't use a key-value type
  // as the parser will override the previous key's value. Since this is kinda crappy for TS consumption we can
  // used named tuples to make it a bit nicer. If you hover over an item in the array you'll see the column names.
  // e.g., row[0] will show ID as the type name.
  type HealthDataFactRow = [
    ID: string, // 0
    Above_Row: string,
    Topic_ID: string,
    Name: string,
    Author: string,
    Source: string, // 5
    Publish_date: string,
    Types: string,
    Types: string,
    Types: string,
    Is_about: string, // 10
    Is_about: string,
    Is_about: string,
    Is_about: string,
    Is_about: string,
    Is_about: string, // 15
    Is_about: string,
    Is_about: string,
    Is_about: string,
    Is_about: string,
    Is_about: string, // 20
    Is_about: string,
    Relevant_age: string,
    Relevant_age: string,
    Relevant_age: string,
    NCMD_Rating: string, // 25
    Importance: string,
    Unit_of_measurement: string,
    Unit_of_measurement: string,
    Sourced_from: string,
    Sourced_from: string, // 30
    Sourced_from: string,
    Relevant_sex: string,
    Relevant_sex: string,
    Relevant_age: string,
    Amount: string, // 35
    Article_section: string // 36
  ];

  const results = parseCSV<HealthDataFactRow>(csv);

  const attributeRows: EavRow[] = [
    // ['text', 'type', 'attribute'],
    // ['text', 'name', 'Text'],
    ['author', 'type', 'attribute'],
    ['author', 'name', 'Author'],
    ['source', 'type', 'attribute'],
    ['source', 'name', 'Source'],
    ['publish date', 'type', 'attribute'],
    ['publish date', 'name', 'Publish date'],
    ['is about', 'type', 'attribute'],
    ['is about', 'name', 'Is about'],
    ['relevant age', 'type', 'attribute'],
    ['relevant age', 'name', 'Relevant age'],
    ['ncmd rating', 'type', 'attribute'],
    ['ncmd rating', 'name', 'NCMD Rating'],
    ['importance', 'type', 'attribute'],
    ['importance', 'name', 'Importance'],
    ['unit of measurement', 'type', 'attribute'],
    ['unit of measurement', 'name', 'Unit of measurement'],
    ['sourced from', 'type', 'attribute'],
    ['sourced from', 'name', 'Sourced from'],
    ['relevant sex', 'type', 'attribute'],
    ['relevant sex', 'name', 'Relevant sex'],
    ['amount', 'type', 'attribute'],
    ['amount', 'name', 'Amount'],
    ['article section', 'type', 'attribute'],
    ['article section', 'name', 'Article section'],
  ];

  function toEavRow(row: HealthDataFactRow): EavRow[] {
    const typesTuples = [{ name: row[7] }, { name: row[8] }, { name: row[9] }].filter(({ name }) => name !== '');

    const isAboutTuples = [
      { name: row[10] },
      { name: row[11] },
      { name: row[12] },
      { name: row[13] },
      { name: row[14] },
      { name: row[15] },
      { name: row[16] },
      { name: row[17] },
      { name: row[18] },
      { name: row[19] },
      { name: row[20] },
      { name: row[21] },
    ].filter(({ name }) => name !== '');

    const relevantAgeTuples = [{ name: row[21] }, { name: row[22] }, { name: row[23] }, { name: row[34] }].filter(
      ({ name }) => name !== ''
    );

    const unitOfMeasurementTuples = [{ name: row[27] }, { name: row[28] }].filter(({ name }) => name !== '');
    const sourcedFromTuples = [{ name: row[29] }, { name: row[30] }, { name: row[31] }].filter(
      ({ name }) => name !== ''
    );

    const relevantSexTuples = [{ name: row[32] }, { name: row[33] }].filter(({ name }) => name !== '');

    return [
      row[3] ? [row[0], 'name', row[3]] : null,
      row[4] ? [row[0], 'author', row[4]] : null,
      row[5] ? [row[0], 'source', row[5]] : null,
      row[6] ? [row[0], 'publish date', row[6]] : null,
      row[25] ? [row[0], 'ncmd rating', row[25]] : null,
      row[26] ? [row[0], 'importance', row[26]] : null,
      row[35] ? [row[0], 'amount', row[35]] : null,
      row[36] ? [row[0], 'article section', row[36]] : null,
      ...typesTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...typesTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...typesTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...isAboutTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...isAboutTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...isAboutTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...relevantAgeTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...relevantAgeTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...relevantAgeTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...unitOfMeasurementTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...unitOfMeasurementTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...unitOfMeasurementTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...sourcedFromTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...sourcedFromTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...sourcedFromTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...relevantSexTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...relevantSexTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...relevantSexTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  // We can skip the headers row. There's also an additional row of instructions we can skip.
  const eavRows = results.data.slice(2, rowCount).flatMap(toEavRow);
  return [...attributeRows, ...eavRows];
}

export function convertLegacyHealthData(
  csv: string,
  { rowCount = Infinity, shouldIncludeSections = true }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
): EavRow[] {
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
    ['fact', 'type', 'type'],
    ['fact', 'name', 'Fact'],
    ['source', 'type', 'attribute'],
    ['source', 'name', 'Source'],
    ['source location', 'type', 'attribute'],
    ['source location', 'name', 'Source Location'],
    ['category', 'type', 'attribute'],
    ['category', 'name', 'Category'],
    ['sourceType', 'type', 'attribute'],
    ['sourceType', 'name', 'Source Type'],
    ['tag', 'type', 'attribute'],
    ['tag', 'name', 'Tag'],
    ['guest', 'type', 'attribute'],
    ['guest', 'name', 'Guest'],
    ['section', 'type', 'attribute'],
    ['section', 'name', 'Is from Section'],
  ];

  function toEavRow(row: HealthDataRow): EavRow[] {
    const tagTuple = [
      { id: row.ID_Tag1, name: row.Tag1 },
      { id: row.ID_Tag2, name: row.Tag2 },
      { id: row.ID_Tag3, name: row.Tag3 },
      { id: row.ID_Tag4, name: row.Tag4 },
      { id: row.ID_Tag5, name: row.Tag5 },
      { id: row.ID_Tag6, name: row.Tag6 },
      { id: row.ID_Tag7, name: row.Tag7 },
      { id: row.ID_Tag8, name: row.Tag8 },
      { id: row.ID_Tag9, name: row.Tag9 },
      { id: row.ID_Tag10, name: row.Tag10 },
      { id: row.ID_Tag11, name: row.Tag11 },
    ].filter(({ id }) => id !== '');

    const guestTuple = [
      { id: row['Entity ID \n(Guest1)'], name: row['Source\n(Guest1)'] },
      { id: row['Entity ID \n(Guest2)'], name: row['Source\n(Guest2)'] },
      { id: row['Entity ID \n(Guest3)'], name: row['Source\n(Guest3)'] },
    ].filter(({ id }) => id !== '');

    return [
      [row.ID_content, 'type', 'fact'],
      [row.ID_content, 'name', row.Content],
      [row.ID_content, 'source', row['Entity ID \n(Source)']],
      [row.ID_content, 'source location', row['Entity ID \n(Location)']],
      [row.ID_content, 'category', row['Entity ID \n(Category)']],
      [row.ID_content, 'sourceType', row['Entity ID \n(Platform)']],
      [row['Entity ID \n(Source)'], 'name', row.Source],
      [row['Entity ID \n(Location)'], 'name', row.SourceLoc],
      [row['Entity ID \n(Category)'], 'name', row.Category],
      [row['Entity ID \n(Platform)'], 'name', row['Platform/Site']],
      ...tagTuple.map(({ id }): EavRow => [row.ID_content, 'tag', id]),
      ...tagTuple.map(({ id, name }): EavRow => [id, 'name', name]),
      ...guestTuple.map(({ id }): EavRow => [row.ID_content, 'guest', id]),
      ...guestTuple.map(({ id, name }): EavRow => [id, 'name', name]),
    ];
  }

  const chunks = chunkBy(results.data, (rowA, rowB) => {
    if (rowA['Title/Fact'] === 'Title' && rowB['Title/Fact'] === 'Title') return false;
    if (rowA['Title/Fact'] === 'Fact' && rowB['Title/Fact'] === 'Title') return false;
    return true;
  }).filter(chunk => chunk.length > 1); // filter chunks that only contain a title

  const sectionEavs = chunks.flatMap((chunk): EavRow[] => {
    const titleRow = chunk[0];
    const factRows = chunk.slice(1);

    // Add reference to section
    return [
      ...factRows.map((factRow): EavRow => [factRow.ID_content, 'section', titleRow.ID_content]),
      [titleRow.ID_content, 'type', 'section'],
      [titleRow.ID_content, 'name', titleRow.Content],
    ];
  });

  const eavRows = results.data.slice(0, rowCount).flatMap(toEavRow);

  return [...attributeRows, ...(shouldIncludeSections ? sectionEavs : []), ...eavRows];
}

export async function importCSVFile(
  file: File,
  space: string,
  createId: CreateUuid = createEntityId
): Promise<Triple[]> {
  const csv = await readFileAsText(file);
  switch (file.name) {
    case 'healthdata.csv':
      return eavRowsToTriples(convertLegacyHealthData(csv), space, createId);
    case 'healthdata-facts.csv':
      return eavRowsToTriples(convertHealthFacts(csv), space, createId);
    default:
      return eavRowsToTriples(readCSV(csv), space, createId);
  }
}

function chunkBy<T>(values: T[], belongInSameGroup: (a: T, b: T) => boolean): T[][] {
  if (values.length === 0) return [];

  const result: T[][] = [];

  let start = 0;
  const end = values.length;

  for (let i = start + 1; i < end; i++) {
    const prev = values[i - 1];
    const next = values[i];

    if (!belongInSameGroup(prev, next)) {
      result.push(values.slice(start, i));
      start = i;
    }
  }

  result.push(values.slice(start, end));

  return result;
}
