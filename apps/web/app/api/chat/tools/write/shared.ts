// Pattern used as the JSON-schema `pattern` for every entity-id input on
// write tools. Case-insensitive — the model can emit uppercase hex, and a
// lowercase-only pattern would silently reject before runtime.
export const ENTITY_ID_PATTERN =
  '^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$';
