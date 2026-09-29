import { type ArgumentNode, type FieldNode, Kind, type SelectionSetNode, type ValueNode, parse } from 'graphql';

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_ROOT_PAGE_WITH_NESTED_LISTS = 100;
export const MAX_ESTIMATED_NODES = 25_000;
export const MAX_DEPTH = 10;

export type QueryGuardResult = { ok: true; estimatedNodes: number } | { ok: false; error: string };

const CONTAINER_FIELDS = new Set(['nodes', 'edges', 'node']);
const PAGINATED_FIELDS = new Set(['entities', 'relations', 'values', 'backlinks']);
const PAGINATION_ARGUMENTS = new Set(['first', 'last', 'offset', 'after', 'before']);

type Variables = Record<string, unknown> | undefined;

function argument(field: FieldNode, name: string): ArgumentNode | undefined {
  return field.arguments?.find(arg => arg.name.value === name);
}

function intValue(value: ValueNode | undefined, variables: Variables): number | null {
  if (!value) return null;
  if (value.kind === Kind.INT) return Number(value.value);
  if (value.kind === Kind.VARIABLE) {
    const bound = variables?.[value.name.value];
    return typeof bound === 'number' && Number.isFinite(bound) ? bound : null;
  }
  return null;
}

function isPaginated(field: FieldNode): boolean {
  const name = field.name.value;
  if (CONTAINER_FIELDS.has(name)) return false;
  if (PAGINATED_FIELDS.has(name) || /(Connection|List)$/.test(name)) return true;
  return field.arguments?.some(arg => PAGINATION_ARGUMENTS.has(arg.name.value)) ?? false;
}

function pageSize(field: FieldNode, variables: Variables): number {
  if (!isPaginated(field)) return 1;
  const first = intValue(argument(field, 'first')?.value, variables);
  return first === null ? DEFAULT_PAGE_SIZE : Math.max(0, first);
}

class Rejected extends Error {}

function fieldsOf(selection: SelectionSetNode): FieldNode[] {
  const fields: FieldNode[] = [];
  for (const node of selection.selections) {
    if (node.kind === Kind.FIELD) fields.push(node);
    else if (node.kind === Kind.INLINE_FRAGMENT) fields.push(...fieldsOf(node.selectionSet));
    else throw new Rejected('Fragments are not supported here — inline the fields instead.');
  }
  return fields;
}

function nestedList(selection: SelectionSetNode | undefined): FieldNode | null {
  if (!selection) return null;
  for (const field of fieldsOf(selection)) {
    if (isPaginated(field)) return field;
    const below = nestedList(field.selectionSet);
    if (below) return below;
  }
  return null;
}

function describe(field: FieldNode): string {
  const first = argument(field, 'first');
  return first
    ? `${field.name.value}(first: ${first.value.kind === Kind.INT ? first.value.value : '$…'})`
    : field.name.value;
}

function estimate(selection: SelectionSetNode | undefined, variables: Variables, depth: number): number {
  if (!selection) return 0;
  if (depth > MAX_DEPTH) {
    throw new Rejected(`The query nests more than ${MAX_DEPTH} levels deep. Select only what the question needs.`);
  }
  let total = 0;
  for (const field of fieldsOf(selection)) {
    const rows = pageSize(field, variables);
    if (rows > MAX_ROOT_PAGE_WITH_NESTED_LISTS) {
      const nested = nestedList(field.selectionSet);
      if (nested) {
        throw new Rejected(
          `A page of ${rows} rows from ${field.name.value} that also selects ${describe(nested)} for every row is the shape that overloads the API. Keep the page at ${MAX_ROOT_PAGE_WITH_NESTED_LISTS} or fewer when nesting a list per row (page with cursors for more), and filter the nested list — e.g. relations(filter: { typeId: { is: "…" } }, first: 20).`
        );
      }
    }
    if (field.selectionSet) total += rows * (1 + estimate(field.selectionSet, variables, depth + 1));
  }
  return total;
}

export function checkQuery(query: string, variables?: Record<string, unknown>): QueryGuardResult {
  let document;
  try {
    document = parse(query, { noLocation: true });
  } catch (err) {
    return { ok: false, error: `GraphQL syntax error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1) {
    return { ok: false, error: 'Send exactly one query operation per call.' };
  }
  if (document.definitions.length !== operations.length) {
    return { ok: false, error: 'Fragments are not supported here — inline the fields instead.' };
  }
  const operation = operations[0];
  if (operation.operation !== 'query') {
    return { ok: false, error: 'Only read queries can run here.' };
  }

  try {
    const estimatedNodes = estimate(operation.selectionSet, variables, 1);
    if (estimatedNodes > MAX_ESTIMATED_NODES) {
      return {
        ok: false,
        error: `This query would hydrate an estimated ${estimatedNodes.toLocaleString('en-US')} objects, over the ${MAX_ESTIMATED_NODES.toLocaleString('en-US')} allowed in one response. Ask for less: a smaller \`first:\` on the outer page, a filter on nested lists, or \`totalCount\` instead of rows.`,
      };
    }
    return { ok: true, estimatedNodes };
  } catch (err) {
    if (err instanceof Rejected) return { ok: false, error: err.message };
    throw err;
  }
}
