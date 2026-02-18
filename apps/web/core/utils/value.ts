/** Extract a string representation from a GRC-20 v2 typed value object. */
export function extractValueString(val: unknown): string {
  if (!val || typeof val !== 'object') {
    return '';
  }

  const v = val as Record<string, unknown>;

  if ('type' in v) {
    switch (v.type) {
      case 'text':
      case 'date':
      case 'time':
      case 'datetime':
      case 'schedule':
        return String(v.value ?? '');
      case 'boolean':
        return v.value ? '1' : '0';
      case 'integer':
      case 'float':
      case 'decimal':
        return String(v.value ?? '');
      case 'point':
        return JSON.stringify({ lon: v.lon, lat: v.lat });
      case 'bytes':
        return String(v.value ?? '');
      default:
        if ('value' in v) {
          return String(v.value ?? '');
        }
        return '';
    }
  }

  if ('value' in v) {
    return String(v.value ?? '');
  }

  return '';
}
