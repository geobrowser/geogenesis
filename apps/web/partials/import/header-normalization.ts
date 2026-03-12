export const HIGH_CONFIDENCE_HEADER_NORMALIZATIONS: Record<string, string> = {
  descripton: 'description',
  desciption: 'description',
  desc: 'description',
  imagecover: 'image cover',
  'image cover': 'image cover',
  founded: 'founded',
  founders: 'founders',
  relatedprojects: 'related projects',
  'related projects': 'related projects',
};

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeHeaderForMatch(value: string): string {
  const normalized = normalizeHeader(value);
  return HIGH_CONFIDENCE_HEADER_NORMALIZATIONS[normalized] ?? normalized;
}
