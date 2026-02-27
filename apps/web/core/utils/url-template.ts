const URL_TEMPLATE_TOKEN = '{value}';

function hasSinglePlaceholder(format: string): boolean {
  const firstIndex = format.indexOf(URL_TEMPLATE_TOKEN);
  if (firstIndex === -1) return false;
  return format.indexOf(URL_TEMPLATE_TOKEN, firstIndex + URL_TEMPLATE_TOKEN.length) === -1;
}

function isHttpUrl(format: string): boolean {
  return /^https?:\/\//i.test(format);
}

function isPlaceholderInSchemeOrHost(format: string): boolean {
  const tokenIndex = format.indexOf(URL_TEMPLATE_TOKEN);
  const schemeEnd = format.indexOf('://');
  if (schemeEnd === -1) return true;
  if (tokenIndex < schemeEnd) return true;

  const hostStart = schemeEnd + 3;
  const slashIndex = format.indexOf('/', hostStart);
  const queryIndex = format.indexOf('?', hostStart);
  const hashIndex = format.indexOf('#', hostStart);
  let hostEnd = format.length;
  [slashIndex, queryIndex, hashIndex].forEach(index => {
    if (index !== -1 && index < hostEnd) hostEnd = index;
  });

  return tokenIndex >= hostStart && tokenIndex < hostEnd;
}

export function isUrlTemplate(format: string | null | undefined): format is string {
  if (!format) return false;
  if (!isHttpUrl(format)) return false;
  if (!hasSinglePlaceholder(format)) return false;
  if (isPlaceholderInSchemeOrHost(format)) return false;
  return true;
}

function isFullyQualifiedUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

export function resolveUrlTemplate(format: string | null | undefined, value: string): string {
  if (!isUrlTemplate(format)) return value;
  if (isFullyQualifiedUrl(value)) return value;
  const templateBase = format.replace(URL_TEMPLATE_TOKEN, '');
  if (value.startsWith(templateBase)) return value;
  return format.replace(URL_TEMPLATE_TOKEN, value);
}
