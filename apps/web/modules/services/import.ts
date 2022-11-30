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
      // If the attribute is name we want to set the value to the name itself and not the mapped id
      // This is due to how we import references on other datasheets by name instead of id.
      value in entityIdMap && mappedAttributeId !== 'name'
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
  // use named tuples to make it a bit nicer. If you hover over an item in the array you'll see the column names.
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
    Article_section: string,
    Benefits: string,
    Benefits: string,
    Benefits: string,
    Benefits: string, // 40
    Benefits: string,
    Benefits: string,
    Tips: string,
    Tips: string,
    Tips: string, // 45
    Tips: string,
    Tips: string,
    Tips: string // 48
  ];

  const results = parseCSV<HealthDataFactRow>(csv);

  const attributeRows: EavRow[] = [
    ['topic', 'type', 'attribute'],
    ['topic', 'name', 'Topic'],
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
    ['tips', 'type', 'attribute'],
    ['benefits', 'type', 'attribute'],
    ['benefits', 'name', 'Benefits'],
    ['tips', 'name', 'Tips'],
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

    const benefitsTuples = [
      { name: row[37] },
      { name: row[38] },
      { name: row[39] },
      { name: row[40] },
      { name: row[41] },
      { name: row[42] },
    ].filter(({ name }) => name !== '');

    const tipsTuples = [
      { name: row[43] },
      { name: row[44] },
      { name: row[45] },
      { name: row[46] },
      { name: row[47] },
      { name: row[48] },
    ].filter(({ name }) => name !== '');

    return [
      row[2] ? [row[0], 'topic', [row[2]]] : null,
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

      ...benefitsTuples.map(({ name }): EavRow => [row[0], 'benefits', name.toLowerCase()]),
      ...benefitsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...benefitsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...tipsTuples.map(({ name }): EavRow => [row[0], 'tips', name.toLowerCase()]),
      ...tipsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...tipsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  // We can skip the headers row. There's also an additional row of instructions we can skip.
  const eavRows = results.data.slice(2, rowCount).flatMap(toEavRow);
  return [...attributeRows, ...eavRows];
}

export function convertHealthEntities(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  // Since we can have many columns with the same name (many-to-many relationships) we can't use a key-value type
  // as the parser will override the previous key's value. Since this is kinda crappy for TS consumption we can
  // use named tuples to make it a bit nicer. If you hover over an item in the array you'll see the column names.
  // e.g., row[0] will show ID as the type name.
  type HealthDataFactRow = [
    // 56
    Entity: string, // 0
    Description_by_GPT3: string,
    Types: string,
    Types: string,
    Types: string,
    Types: string, // 5
    Belongs_to: string,
    Used_for: string,
    Used_for: string,
    Used_for: string,
    Used_for: string, // 10
    Used_for: string,
    Used_for: string,
    Used_as: string,
    Used_as: string,
    Related_to: string,
    Related_to: string,
    Related_to: string,
    Related_to: string,
    Involved_in: string,
    Involved_in: string,
    Involved_in: string,
    Involved_in: string,
    Involved_in: string,
    Also_known_as: string,
    Caused_by: string,
    Caused_by: string,
    Caused_by: string,
    Caused_by: string,
    Can_cause: string,
    Can_cause: string,
    Can_cause: string,
    Can_cause: string,
    Can_cause: string,
    Can_cause: string,
    Found_in: string,
    Found_in: string,
    Found_in: string,
    Found_in: string,
    Found_in: string,
    Found_in: string,
    Brand_name: string,
    Brand_name: string,
    Brand_name: string,
    Brand_name: string,
    Symptom_of: string,
    Symptom_of: string,
    Originated_from: string,
    Originated_from: string,
    Natural_habitat: string,
    Natural_habitat: string,
    Precursor_to: string,
    Contains: string,
    Contains: string,
    Contains: string,
    Contains: string
  ];

  const results = parseCSV<HealthDataFactRow>(csv);

  const attributeRows: EavRow[] = [
    ['description', 'type', 'attribute'],
    ['description', 'name', 'Description'],
    ['belongs to', 'type', 'attribute'],
    ['belongs to', 'name', 'Belongs to'],
    ['used for', 'type', 'attribute'],
    ['used for', 'name', 'Used for'],
    ['used as', 'type', 'attribute'],
    ['used as', 'name', 'Used as'],
    ['related to', 'type', 'attribute'],
    ['related to', 'name', 'Related to'],
    ['involved in', 'type', 'attribute'],
    ['involved in', 'name', 'Involved in'],
    ['also known as', 'type', 'attribute'],
    ['also known as', 'name', 'Also known as'],
    ['caused by', 'type', 'attribute'],
    ['caused by', 'name', 'Caused by'],
    ['can cause', 'type', 'attribute'],
    ['can cause', 'name', 'Can cause'],
    ['found in', 'type', 'attribute'],
    ['found in', 'name', 'Found in'],
    ['brand name', 'type', 'attribute'],
    ['brand name', 'name', 'Brand name'],
    ['symptom of', 'type', 'attribute'],
    ['symptom of', 'name', 'Symptom of'],
    ['originated from', 'type', 'attribute'],
    ['originated from', 'name', 'Originated from'],
    ['natural habitat', 'type', 'attribute'],
    ['natural habitat', 'name', 'Natural habitat'],
    ['precursor to', 'type', 'attribute'],
    ['precursor to', 'name', 'Precursor to'],
    ['contains', 'type', 'attribute'],
    ['contains', 'name', 'Contains'],
  ];

  function toEavRow(row: HealthDataFactRow): EavRow[] {
    const typesTuples = [{ name: row[2] }, { name: row[3] }, { name: row[4] }, { name: row[5] }].filter(
      ({ name }) => name !== ''
    );

    const usedForTuples = [
      { name: row[7] },
      { name: row[8] },
      { name: row[9] },
      { name: row[10] },
      { name: row[11] },
      { name: row[12] },
    ].filter(({ name }) => name !== '');

    const usedAsTuples = [{ name: row[13] }, { name: row[14] }].filter(({ name }) => name !== '');

    const relatedToTuples = [{ name: row[15] }, { name: row[16] }, { name: row[17] }, { name: row[18] }].filter(
      ({ name }) => name !== ''
    );

    const involvedInTuples = [
      { name: row[19] },
      { name: row[20] },
      { name: row[21] },
      { name: row[22] },
      { name: row[23] },
    ].filter(({ name }) => name !== '');

    const causedByTuples = [{ name: row[25] }, { name: row[26] }, { name: row[27] }, { name: row[28] }].filter(
      ({ name }) => name !== ''
    );

    const canCauseTuples = [
      { name: row[29] },
      { name: row[30] },
      { name: row[31] },
      { name: row[32] },
      { name: row[33] },
      { name: row[34] },
    ].filter(({ name }) => name !== '');

    const foundInTuples = [
      { name: row[35] },
      { name: row[36] },
      { name: row[37] },
      { name: row[38] },
      { name: row[39] },
      { name: row[40] },
    ].filter(({ name }) => name !== '');

    const brandNameTuples = [{ name: row[41] }, { name: row[42] }, { name: row[43] }, { name: row[44] }].filter(
      ({ name }) => name !== ''
    );

    const symptomOfTuples = [{ name: row[45] }, { name: row[46] }].filter(({ name }) => name !== '');

    const originatedFromTuples = [{ name: row[47] }, { name: row[48] }].filter(({ name }) => name !== '');

    const naturalHabitatTuples = [{ name: row[49] }, { name: row[50] }].filter(({ name }) => name !== '');

    const containsTuples = [{ name: row[52] }, { name: row[53] }, { name: row[54] }, { name: row[55] }].filter(
      ({ name }) => name !== ''
    );

    return [
      row[0] ? [row[0], 'name', row[0]] : null,
      row[1] ? [row[0], 'description', row[1]] : null,
      row[6] ? [row[0], 'belongs to', row[6]] : null,
      row[24] ? [row[0], 'also known as', row[24]] : null,
      row[51] ? [row[0], 'precursor to', row[51]] : null,

      ...typesTuples.map(({ name }): EavRow => [row[0], 'type', name.toLowerCase()]),
      ...typesTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...typesTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...usedForTuples.map(({ name }): EavRow => [row[0], 'used for', name.toLowerCase()]),
      ...usedForTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...usedForTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...usedAsTuples.map(({ name }): EavRow => [row[0], 'used as', name.toLowerCase()]),
      ...usedAsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...usedAsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...relatedToTuples.map(({ name }): EavRow => [row[0], 'related to', name.toLowerCase()]),
      ...relatedToTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...relatedToTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...involvedInTuples.map(({ name }): EavRow => [row[0], 'involved in', name.toLowerCase()]),
      ...involvedInTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...involvedInTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...causedByTuples.map(({ name }): EavRow => [row[0], 'caused by', name.toLowerCase()]),
      ...causedByTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...causedByTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...canCauseTuples.map(({ name }): EavRow => [row[0], 'can cause', name.toLowerCase()]),
      ...canCauseTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...canCauseTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...foundInTuples.map(({ name }): EavRow => [row[0], 'found in', name.toLowerCase()]),
      ...foundInTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...foundInTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...brandNameTuples.map(({ name }): EavRow => [row[0], 'brand name', name.toLowerCase()]),
      ...brandNameTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...brandNameTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...symptomOfTuples.map(({ name }): EavRow => [row[0], 'symptom of', name.toLowerCase()]),
      ...symptomOfTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...symptomOfTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...originatedFromTuples.map(({ name }): EavRow => [row[0], 'originated from', name.toLowerCase()]),
      ...originatedFromTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...originatedFromTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...naturalHabitatTuples.map(({ name }): EavRow => [row[0], 'natural habitat', name.toLowerCase()]),
      ...naturalHabitatTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...naturalHabitatTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),

      ...containsTuples.map(({ name }): EavRow => [row[0], 'contains', name.toLowerCase()]),
      ...containsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'name', name]),
      ...containsTuples.map(({ name }): EavRow => [name.toLowerCase(), 'type', 'attribute']),
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  // We can skip the headers row.
  const eavRows = results.data.slice(1, rowCount).flatMap(toEavRow);
  return [...attributeRows, ...eavRows];
}

function convertHealthPodcastNotes(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  type HealthDataSourceRow = {
    Entity: string;
    Types: string;
    Name: string;
    Author: string;
    URL: string;
    'Publish date': string;
    Podcast: string;
    'Podcast episode': string;
  };

  const results = parseCSV<HealthDataSourceRow>(csv, { header: true });

  const attributeRows: EavRow[] = [
    ['author', 'type', 'attribute'],
    ['author', 'name', 'Author'],
    ['url', 'type', 'attribute'],
    ['url', 'name', 'URL'],
    ['publish date', 'type', 'attribute'],
    ['publish date', 'name', 'Publish date'],
    ['podcast', 'type', 'attribute'],
    ['podcast', 'name', 'Podcast'],
    ['podcast episode', 'type', 'attribute'],
    ['podcast episode', 'name', 'Podcast episode'],
  ];

  function toEavRow(row: HealthDataSourceRow): EavRow[] {
    return [
      row.Entity ? [row.Entity, 'name', row.Name] : null, // The Entity and the name are the same
      row.Types ? [row.Entity, 'type', row.Types.toLowerCase()] : null,
      row.Types ? [row.Types.toLowerCase(), 'name', row.Types] : null,
      row.Types ? [row.Types.toLowerCase(), 'type', 'attribute'] : null,
      row.Author ? [row.Entity, 'author', row.Author] : null,
      row.URL ? [row.Entity, 'url', row.URL] : null,
      row['Publish date'] ? [row.Entity, 'publish date', row['Publish date']] : null,
      row.Podcast ? [row.Entity, 'podcast', row.Podcast.toLowerCase()] : null,
      row.Podcast ? [row.Podcast.toLowerCase(), 'name', row.Podcast] : null,
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  const eavRows = results.data.slice(1, rowCount).flatMap(toEavRow);

  return [...attributeRows, ...eavRows];
}

function convertHealthOriginalPodcasts(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  type HealthDataSourceRow = {
    Entity: string;
    Types: string;
    about: string;
    'Authored by': string;
    'Contributed by': string;
    Name: string;
    Podcast: string;
    URL: string;
    'Publish date': string;
  };

  const results = parseCSV<HealthDataSourceRow>(csv, { header: true });

  const attributeRows: EavRow[] = [
    ['about', 'type', 'attribute'],
    ['about', 'name', 'about'],
    ['authored by', 'type', 'attribute'],
    ['authored by', 'name', 'Authored by'],
    ['contributed by', 'type', 'attribute'],
    ['contributed by', 'name', 'Contributed by'],
    ['podcast', 'type', 'attribute'],
    ['podcast', 'name', 'Podcast'],
    ['url', 'type', 'attribute'],
    ['url', 'name', 'URL'],
    ['publish date', 'type', 'attribute'],
    ['publish date', 'name', 'Publish date'],
  ];

  function toEavRow(row: HealthDataSourceRow): EavRow[] {
    return [
      row.Entity ? [row.Entity, 'name', row.Name] : null, // The Entity and the name are the same
      row.Types ? [row.Entity, 'type', row.Types.toLowerCase()] : null,
      row.Types ? [row.Types.toLowerCase(), 'name', row.Types] : null,
      row.Types ? [row.Types.toLowerCase(), 'type', 'attribute'] : null,
      row['about'] ? [row.Entity, 'author', row['about']] : null,
      row['Authored by'] ? [row.Entity, 'authored by', row['Authored by']] : null, // Dr. Andrew Huberman

      // If the contributedby Person doesn't exist yet we need to create them
      row['Contributed by'] ? [row.Entity, 'contributed by', row['Contributed by'].toLowerCase()] : null,
      row['Contributed by'] ? [row['Contributed by'].toLowerCase(), 'type', 'person'] : null,
      row['Contributed by'] ? [row['Contributed by'].toLowerCase(), 'name', row['Contributed by']] : null,
      row.Podcast ? [row.Entity, 'podcast', row.Podcast.toLowerCase()] : null,
      row.Podcast ? [row.Podcast.toLowerCase(), 'name', row.Podcast] : null,
      row.URL ? [row.Entity, 'url', row.URL] : null,
      row['Publish date'] ? [row.Entity, 'publish date', row['Publish date']] : null,
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  const eavRows = results.data.slice(1, rowCount).flatMap(toEavRow);

  return [...attributeRows, ...eavRows];
}

function convertHealthPeople(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  type HealthDataSourceRow = {
    Entity: string;
    Types: string;
    Name: string;
    About: string;
    Fields: string;
    'Author of': string;
  };

  const results = parseCSV<HealthDataSourceRow>(csv, { header: true });

  const attributeRows: EavRow[] = [
    ['about', 'type', 'attribute'],
    ['about', 'name', 'About'],
    ['fields', 'type', 'attribute'],
    ['fields', 'name', 'Fields'],
    ['author of', 'type', 'attribute'],
    ['author of', 'name', 'Author of'],
  ];

  function toEavRow(row: HealthDataSourceRow): EavRow[] {
    return [
      row.Entity ? [row.Entity, 'name', row.Name] : null, // Dr. Andrew Huberman <> Andrew Huberman
      row.Types ? [row.Entity, 'type', row.Types.toLowerCase()] : null,
      row.Types ? [row.Types.toLowerCase(), 'name', row.Types] : null,
      row.Types ? [row.Types.toLowerCase(), 'type', 'attribute'] : null,
      row.About ? [row.Entity, 'about', row.About] : null,
      row.Fields ? [row.Entity, 'fields', row.Fields] : null,
      row['Author of'] ? [row.Entity, 'author of', row['Author of']] : null,
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  const eavRows = results.data.slice(1, rowCount).flatMap(toEavRow);

  return [...attributeRows, ...eavRows];
}

function convertHealthArticles(
  csv: string,
  { rowCount = Infinity }: ConvertHealthDataOptions = {
    rowCount: Infinity,
    shouldIncludeSections: true,
  }
) {
  type HealthDataSourceRow = {
    Entity: string;
    Types: string;
    Author: string;
    URL: string;
    'Publish date': string;
  };

  const results = parseCSV<HealthDataSourceRow>(csv, { header: true });

  const attributeRows: EavRow[] = [
    ['author', 'type', 'attribute'],
    ['author', 'name', 'Author'],
    ['url', 'type', 'attribute'],
    ['url', 'name', 'URL'],
    ['publish date', 'type', 'attribute'],
    ['publish date', 'name', 'Publish date'],
  ];

  function toEavRow(row: HealthDataSourceRow): EavRow[] {
    return [
      row.Entity ? [row.Entity, 'name', row.Entity] : null, // The Entity and the name are the same
      row.Types ? [row.Entity, 'type', row.Types.toLowerCase()] : null,
      row.Types ? [row.Types.toLowerCase(), 'name', row.Types] : null,
      row.Types ? [row.Types.toLowerCase(), 'type', 'attribute'] : null,
      row.Author ? [row.Entity, 'author', row.Author.toLowerCase()] : null,
      row.Author ? [row.Author.toLowerCase(), 'name', row.Author] : null,
      row.URL ? [row.Entity, 'url', row.URL] : null,
      row['Publish date'] ? [row.Entity, 'publish date', row['Publish date']] : null,
    ].flatMap((row): EavRow[] => (row ? [row as EavRow] : []));
  }

  // Since we aren't using header rows the parser parses the first row as the headers.
  const eavRows = results.data.slice(1, rowCount).flatMap(toEavRow);

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
  files: File[],
  space: string,
  createId: CreateUuid = createEntityId
): Promise<Triple[]> {
  let eavs: EavRow[] = [];

  for (const file of files) {
    const csv = await readFileAsText(file);
    switch (file.name) {
      case 'healthdata.csv':
        eavs = [...eavs, ...convertLegacyHealthData(csv)];
        break;
      case 'healthdata-facts.csv':
        eavs = [...eavs, ...convertHealthFacts(csv)];
        break;
      case 'healthdata-podcast-notes.csv':
        eavs = [...eavs, ...convertHealthPodcastNotes(csv)];
        break;
      case 'healthdata-original-podcasts.csv':
        eavs = [...eavs, ...convertHealthOriginalPodcasts(csv)];
        break;
      case 'healthdata-people.csv':
        eavs = [...eavs, ...convertHealthPeople(csv)];
        break;
      case 'healthdata-articles.csv':
        eavs = [...eavs, ...convertHealthArticles(csv)];
        break;
      case 'healthdata-entities.csv':
        eavs = [...eavs, ...convertHealthEntities(csv)];
        break;
      default:
        eavs = [...eavs, ...readCSV(csv)];
        break;
    }
  }

  return eavRowsToTriples(eavs, space, createId);
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
