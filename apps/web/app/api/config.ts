const GEO_PK = process.env.GEO_PK;

if (!GEO_PK) {
  throw new Error('GEO_PK is not set');
}

const TELEMETRY_URL = process.env.TELEMETRY_URL;
const TELEMETRY_TOKEN = process.env.TELEMETRY_TOKEN;

export { GEO_PK, TELEMETRY_URL, TELEMETRY_TOKEN };
