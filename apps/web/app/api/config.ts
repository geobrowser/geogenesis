const GEO_PK = process.env.GEO_PK;

if (!GEO_PK) {
  throw new Error('GEO_PK is not set');
}

const TELEMETRY_URL = process.env.TELEMETRY_URL;

if (!TELEMETRY_URL) {
  throw new Error('TELEMETRY_URL is not set');
}

const TELEMETRY_TOKEN = process.env.TELEMETRY_TOKEN;

if (!TELEMETRY_TOKEN) {
  throw new Error('TELEMETRY_TOKEN is not set');
}

export { GEO_PK, TELEMETRY_URL, TELEMETRY_TOKEN };
