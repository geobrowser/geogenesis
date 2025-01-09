import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 5001;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const CHAIN_RPC = process.env.CHAIN_RPC!;
export const TELEMETRY_URL = process.env.TELEMETRY_URL!;
export const TELEMETRY_TOKEN = process.env.TELEMETRY_TOKEN!;

if (!DATABASE_URL) {
  throw 'DATABASE_URL must be set';
}
if (!CHAIN_RPC) {
  throw 'CHAIN_RPC must be set';
}

if (!TELEMETRY_URL || !TELEMETRY_TOKEN) {
  console.log('Telemetry not configured');
}
